from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Vehiculo(models.Model):
    """Vehículo de la empresa. Es la fuente de verdad de la flota: el ERP lo lee desde aquí (ya no hay una copia en JSON).
    Los vencimientos NO se guardan en el vehículo: salen del último documento registrado (`DocumentoVehiculo`), y el kilometraje
    avanza solo mediante lecturas del odómetro (`LecturaOdometro`), así queda el historial."""

    class Estado(models.TextChoices):
        ACTIVO = 'ACTIVO', 'Activo'
        EN_TALLER = 'EN_TALLER', 'En taller'

    codigo = models.CharField(max_length=10, unique=True, blank=True, help_text="Id público del ERP: «VH-01». Se asigna solo.")
    patente = models.CharField(max_length=10, unique=True)
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)
    anio = models.PositiveSmallIntegerField(null=True, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.ACTIVO)
    tecnico = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='vehiculos')
    kilometraje = models.PositiveIntegerField(default=0, help_text='Última lectura del odómetro. Solo cambia al registrar una lectura.')
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['patente']

    def save(self, *args, **kwargs):
        if not self.codigo:
            from .servicio import siguiente_codigo
            self.codigo = siguiente_codigo()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.patente


class DocumentoVehiculo(models.Model):
    """Revisión técnica, permiso de circulación o seguro obligatorio. Cada renovación es un registro NUEVO: el historial no se edita."""

    class Tipo(models.TextChoices):
        REVISION_TECNICA = 'REVISION_TECNICA', 'Revisión técnica'
        PERMISO_CIRCULACION = 'PERMISO_CIRCULACION', 'Permiso de circulación'
        SEGURO = 'SEGURO', 'Seguro obligatorio (SOAP)'

    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.PROTECT, related_name='documentos')
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    fecha_realizacion = models.DateField(null=True, blank=True, help_text='Día en que se hizo o se emitió. Vacío en datos antiguos que solo tenían el vencimiento.')
    fecha_vencimiento = models.DateField()
    referencia = models.CharField(max_length=80, blank=True, help_text='N.º de certificado, de póliza o aseguradora')
    observacion = models.CharField(max_length=300, blank=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_vencimiento', '-id']
        indexes = [models.Index(fields=['vehiculo', 'tipo', '-fecha_vencimiento'])]
        constraints = [models.CheckConstraint(condition=Q(fecha_realizacion__isnull=True) | Q(fecha_vencimiento__gte=F('fecha_realizacion')),
                                              name='vencimiento_no_anterior_a_realizacion')]

    def __str__(self):
        return f'{self.get_tipo_display()} · {self.vehiculo} · vence {self.fecha_vencimiento}'


class LecturaOdometro(models.Model):
    """Cada vez que cambia el kilometraje queda una línea: de dónde vino, quién y cuándo. El odómetro solo avanza."""

    class Origen(models.TextChoices):
        INICIAL = 'INICIAL', 'Lectura inicial'
        HOJA_SERVICIO = 'HOJA_SERVICIO', 'Hoja de servicio'
        MANUAL = 'MANUAL', 'Registro manual'

    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.PROTECT, related_name='lecturas')
    km = models.PositiveIntegerField()
    fecha = models.DateTimeField(default=timezone.now)
    origen = models.CharField(max_length=14, choices=Origen.choices)
    referencia = models.CharField(max_length=60, blank=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-fecha', '-id']
        verbose_name_plural = 'lecturas de odómetro'

    def __str__(self):
        return f'{self.vehiculo} · {self.km} km'
