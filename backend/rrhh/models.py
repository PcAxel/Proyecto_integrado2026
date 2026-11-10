from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .archivos import almacen_privado, ruta_comprobante, ruta_documento, ruta_firma, ruta_firmado, validar_ext_comprobante, validar_ext_pdf
from .calculo import CAUSALES
from .validadores import validar_rut


class FichaTrabajador(models.Model):
    """Datos laborales y previsionales de una persona. La cuenta (`CustomUser`) queda solo para el acceso y el rol: el Administrador
    crea la credencial y luego RR. HH. (o el Administrador) completa esta ficha. Base para contratos y liquidaciones de sueldo."""

    class AFP(models.TextChoices):
        CAPITAL = 'CAPITAL', 'AFP Capital'
        CUPRUM = 'CUPRUM', 'AFP Cuprum'
        HABITAT = 'HABITAT', 'AFP Habitat'
        MODELO = 'MODELO', 'AFP Modelo'
        PLANVITAL = 'PLANVITAL', 'AFP PlanVital'
        PROVIDA = 'PROVIDA', 'AFP ProVida'
        UNO = 'UNO', 'AFP Uno'
        IPS = 'IPS', 'IPS (sistema antiguo)'

    class SistemaSalud(models.TextChoices):
        FONASA = 'FONASA', 'Fonasa'
        ISAPRE = 'ISAPRE', 'Isapre'

    class Isapre(models.TextChoices):
        BANMEDICA = 'BANMEDICA', 'Banmédica'
        COLMENA = 'COLMENA', 'Colmena Golden Cross'
        CONSALUD = 'CONSALUD', 'Consalud'
        CRUZ_BLANCA = 'CRUZ_BLANCA', 'Cruz Blanca'
        ESENCIAL = 'ESENCIAL', 'Esencial'
        NUEVA_MASVIDA = 'NUEVA_MASVIDA', 'Nueva Masvida'
        VIDA_TRES = 'VIDA_TRES', 'Vida Tres'
        OTRA = 'OTRA', 'Otra isapre'

    class TipoContrato(models.TextChoices):
        PLAZO_FIJO = 'PLAZO_FIJO', 'Plazo fijo'
        INDEFINIDO = 'INDEFINIDO', 'Indefinido'
        OBRA_FAENA = 'OBRA_FAENA', 'Obra o faena'

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='ficha')
    rut = models.CharField(max_length=10, unique=True, validators=[validar_rut], help_text='Sin puntos y con guion: 12345678-5')
    afp = models.CharField('previsión (AFP)', max_length=12, choices=AFP.choices)
    sistema_salud = models.CharField(max_length=6, choices=SistemaSalud.choices)
    isapre = models.CharField(max_length=14, choices=Isapre.choices, blank=True, help_text='Solo si el sistema de salud es Isapre')
    tipo_contrato = models.CharField(max_length=12, choices=TipoContrato.choices)
    fecha_ingreso = models.DateField()
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['usuario__first_name', 'usuario__last_name', 'usuario__email']
        verbose_name = 'ficha de trabajador'
        verbose_name_plural = 'fichas de trabajadores'
        constraints = [
            models.CheckConstraint(
                condition=(Q(sistema_salud='FONASA', isapre='') | (Q(sistema_salud='ISAPRE') & ~Q(isapre=''))),
                name='isapre_solo_si_sistema_isapre'),
        ]

    def clean(self):
        if self.sistema_salud == self.SistemaSalud.ISAPRE and not self.isapre:
            raise ValidationError({'isapre': 'Indica la isapre.'})
        if self.sistema_salud == self.SistemaSalud.FONASA and self.isapre:
            raise ValidationError({'isapre': 'Fonasa no lleva isapre.'})

    def __str__(self):
        return f'Ficha de {self.usuario}'


class Contrato(models.Model):
    """Período contractual y sueldo base. El TIPO de contrato no se guarda aquí: la fuente de verdad es `FichaTrabajador.tipo_contrato`."""

    class Estado(models.TextChoices):
        ACTIVO = 'ACTIVO', 'Activo'
        FINIQUITADO = 'FINIQUITADO', 'Finiquitado'

    empleado = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contratos')
    fecha_inicio = models.DateField()
    fecha_termino = models.DateField(null=True, blank=True)
    sueldo_base = models.DecimalField(max_digits=12, decimal_places=0)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.ACTIVO)
    # True mientras el contrato está activo, NULL después. MySQL no admite índices únicos condicionales, pero sí varios NULL
    # en un índice único: así la base garantiza un solo contrato vigente por empleado.
    vigente = models.BooleanField(null=True, default=True, editable=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_inicio', '-id']
        constraints = [
            models.UniqueConstraint(fields=['empleado', 'vigente'], name='un_contrato_activo_por_empleado'),
            models.CheckConstraint(condition=Q(sueldo_base__gt=0), name='sueldo_base_positivo'),
        ]

    @property
    def tipo_contrato(self):
        """Tipo de contrato de la ficha del trabajador (None si aún no tiene ficha)."""
        ficha = getattr(self.empleado, 'ficha', None)
        return ficha.tipo_contrato if ficha else None

    def clean(self):
        if self.tipo_contrato == FichaTrabajador.TipoContrato.PLAZO_FIJO and not self.fecha_termino:
            raise ValidationError({'fecha_termino': 'Un contrato a plazo fijo requiere fecha de término.'})
        if self.fecha_termino and self.fecha_termino < self.fecha_inicio:
            raise ValidationError({'fecha_termino': 'La fecha de término no puede ser anterior al inicio.'})

    def save(self, *args, **kwargs):
        self.vigente = True if self.estado == self.Estado.ACTIVO else None
        if (uf := kwargs.get('update_fields')) is not None:
            kwargs['update_fields'] = {*uf, 'vigente'}
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Contrato {self.pk} · {self.empleado}'


class DocumentoRRHH(models.Model):
    class Tipo(models.TextChoices):
        AMONESTACION = 'AMONESTACION', 'Amonestación'
        ANEXO = 'ANEXO', 'Anexo de contrato'
        CARTA_DESPIDO = 'CARTA_DESPIDO', 'Carta de despido'
        OTRO = 'OTRO', 'Otro'

    empleado = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='documentos_rrhh')
    tipo_documento = models.CharField(max_length=14, choices=Tipo.choices)
    archivo_pdf = models.FileField(upload_to=ruta_documento, storage=almacen_privado, validators=[validar_ext_pdf])
    fecha_emision = models.DateField(default=timezone.localdate)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_emision', '-id']


class Finiquito(models.Model):
    class EstadoPago(models.TextChoices):
        PENDIENTE = 'PENDIENTE', 'Pendiente'
        PAGADO = 'PAGADO', 'Pagado'

    contrato = models.OneToOneField(Contrato, on_delete=models.PROTECT, related_name='finiquito')
    causal_despido = models.CharField(max_length=20, choices=[(k, v[0]) for k, v in CAUSALES.items()])
    fecha_termino = models.DateField()
    aviso_previo_dado = models.BooleanField(default=True)
    dias_vacaciones_pendientes = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    # Calculados SIEMPRE en el servidor (rrhh.calculo): ningún cliente los fija.
    monto_indemnizacion = models.DecimalField(max_digits=12, decimal_places=0, default=0)
    monto_total = models.DecimalField(max_digits=12, decimal_places=0, default=0)
    estado_pago = models.CharField(max_length=10, choices=EstadoPago.choices, default=EstadoPago.PENDIENTE)
    comprobante_pago = models.FileField(upload_to=ruta_comprobante, storage=almacen_privado, validators=[validar_ext_comprobante], null=True, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    creado_en = models.DateTimeField(auto_now_add=True)
    pagado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    pagado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-creado_en']
        constraints = [
            # Un finiquito pagado siempre tiene comprobante, aunque alguien escriba directo en la base.
            models.CheckConstraint(condition=Q(estado_pago='PENDIENTE') | (~Q(comprobante_pago='') & Q(comprobante_pago__isnull=False)),
                                   name='pagado_exige_comprobante'),
        ]


class DocumentoLaboral(models.Model):
    """Contrato o anexo que el trabajador firma dibujando en su celular. Una vez firmado es inmutable."""

    class Tipo(models.TextChoices):
        CONTRATO = 'CONTRATO', 'Contrato'
        ANEXO = 'ANEXO', 'Anexo'

    class Estado(models.TextChoices):
        PENDIENTE = 'PENDIENTE', 'Pendiente'
        FIRMADO = 'FIRMADO', 'Firmado'

    trabajador = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='documentos_laborales')
    tipo_documento = models.CharField(max_length=10, choices=Tipo.choices)
    titulo = models.CharField(max_length=150, blank=True)
    archivo_pdf = models.FileField(upload_to=ruta_documento, storage=almacen_privado, validators=[validar_ext_pdf])
    hash_pdf = models.CharField(max_length=64, editable=False)  # SHA-256 al subir; se revalida al firmar
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.PENDIENTE)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    creado_en = models.DateTimeField(auto_now_add=True)
    # Evidencia de la firma (la escribe solo el servidor)
    firma_imagen = models.ImageField(upload_to=ruta_firma, storage=almacen_privado, null=True, blank=True)
    ip_firma = models.GenericIPAddressField(null=True, blank=True)
    agente_firma = models.CharField(max_length=255, blank=True)
    fecha_firma = models.DateTimeField(null=True, blank=True)
    # La firma pertenece a ESTE documento: su huella es única en toda la base, así un trazo guardado no se puede reusar en otro.
    hash_firma = models.CharField(max_length=64, null=True, blank=True, unique=True, editable=False)
    # PDF original + hoja de constancia. El original queda intacto en `archivo_pdf`.
    archivo_firmado = models.FileField(upload_to=ruta_firmado, storage=almacen_privado, null=True, blank=True)
    hash_firmado = models.CharField(max_length=64, blank=True, editable=False)

    class Meta:
        ordering = ['-creado_en']
        constraints = [
            models.CheckConstraint(
                condition=Q(estado='PENDIENTE') | (~Q(firma_imagen='') & Q(firma_imagen__isnull=False) & Q(ip_firma__isnull=False) & Q(fecha_firma__isnull=False)
                                         & ~Q(archivo_firmado='') & Q(archivo_firmado__isnull=False) & Q(hash_firma__isnull=False)),
                name='firmado_exige_evidencia'),
        ]
