from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from accounts.models import CustomUser, Role

from . import archivos, sellado
from .calculo import CAUSALES, calcular_finiquito
from .models import Contrato, DocumentoLaboral, DocumentoRRHH, Finiquito


def nombre_de(u):
    return u.full_name or u.email


class ContratoSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.SerializerMethodField()
    finiquito_id = serializers.SerializerMethodField()

    class Meta:
        model = Contrato
        fields = ['id', 'empleado', 'empleado_nombre', 'tipo_contrato', 'fecha_inicio', 'fecha_termino', 'sueldo_base', 'estado', 'finiquito_id']
        read_only_fields = ['estado']  # solo cambia al pagarse el finiquito

    def get_empleado_nombre(self, c):
        return nombre_de(c.empleado)

    def get_finiquito_id(self, c):
        return getattr(getattr(c, 'finiquito', None), 'id', None)

    def validate_empleado(self, u):
        if not u.is_active:
            raise serializers.ValidationError('El empleado está inactivo.')
        return u

    def validate(self, datos):
        if self.instance and self.instance.estado == Contrato.Estado.FINIQUITADO:
            raise serializers.ValidationError('Un contrato finiquitado no se puede modificar.')
        if self.instance and 'empleado' in datos and datos['empleado'] != self.instance.empleado:
            raise serializers.ValidationError({'empleado': 'No se puede cambiar el empleado de un contrato.'})
        actual = {f: getattr(self.instance, f) for f in ('tipo_contrato', 'fecha_inicio', 'fecha_termino')} if self.instance else {}
        mezcla = {**actual, **datos}
        if mezcla.get('tipo_contrato') == Contrato.Tipo.PLAZO_FIJO and not mezcla.get('fecha_termino'):
            raise serializers.ValidationError({'fecha_termino': 'Un contrato a plazo fijo requiere fecha de término.'})
        if mezcla.get('fecha_termino') and mezcla['fecha_termino'] < mezcla['fecha_inicio']:
            raise serializers.ValidationError({'fecha_termino': 'La fecha de término no puede ser anterior al inicio.'})
        if not self.instance and Contrato.objects.filter(empleado=datos['empleado'], estado=Contrato.Estado.ACTIVO).exists():
            raise serializers.ValidationError({'empleado': 'El empleado ya tiene un contrato activo.'})
        return datos


class DocumentoSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoRRHH
        fields = ['id', 'empleado', 'empleado_nombre', 'tipo_documento', 'archivo_pdf', 'fecha_emision', 'creado_en']
        read_only_fields = ['creado_en']
        extra_kwargs = {'archivo_pdf': {'write_only': True}}  # el archivo se baja solo por la vista con permisos

    def get_empleado_nombre(self, d):
        return nombre_de(d.empleado)

    def validate_archivo_pdf(self, f):
        return archivos.validar_archivo(f, ['pdf'])

    def validate_fecha_emision(self, f):
        if f > timezone.localdate():
            raise serializers.ValidationError('La fecha de emisión no puede ser futura.')
        return f


class FiniquitoSerializer(serializers.ModelSerializer):
    """Lectura para todos los roles con acceso. `tiene_comprobante` reemplaza a la ruta del archivo."""
    empleado_nombre = serializers.SerializerMethodField()
    causal_texto = serializers.SerializerMethodField()
    tiene_comprobante = serializers.SerializerMethodField()
    sueldo_base = serializers.DecimalField(source='contrato.sueldo_base', max_digits=12, decimal_places=0, read_only=True)

    class Meta:
        model = Finiquito
        fields = ['id', 'contrato', 'empleado_nombre', 'sueldo_base', 'causal_despido', 'causal_texto', 'fecha_termino', 'aviso_previo_dado',
                  'dias_vacaciones_pendientes', 'monto_indemnizacion', 'monto_total', 'estado_pago', 'tiene_comprobante', 'creado_en', 'pagado_en']
        read_only_fields = fields

    def get_empleado_nombre(self, f):
        return nombre_de(f.contrato.empleado)

    def get_causal_texto(self, f):
        return CAUSALES[f.causal_despido][0]

    def get_tiene_comprobante(self, f):
        return bool(f.comprobante_pago)


def montos_para(contrato, causal, fecha_termino, dias, aviso):
    uf = settings.VALOR_UF
    return calcular_finiquito(causal=causal, sueldo_base=contrato.sueldo_base, fecha_inicio=contrato.fecha_inicio, fecha_termino=fecha_termino,
                              dias_vacaciones_pendientes=dias, aviso_previo_dado=aviso, valor_uf=uf)


class CalculoSerializer(serializers.Serializer):
    """Entrada de RR. HH. para crear/recalcular. Los montos nunca vienen del cliente."""
    contrato = serializers.PrimaryKeyRelatedField(queryset=Contrato.objects.select_related('empleado'))
    causal_despido = serializers.ChoiceField(choices=list(CAUSALES))
    fecha_termino = serializers.DateField()
    dias_vacaciones_pendientes = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=0, max_value=365, default=0)
    aviso_previo_dado = serializers.BooleanField(default=True)

    def validate(self, d):
        c = d['contrato']
        if c.estado != Contrato.Estado.ACTIVO:
            raise serializers.ValidationError({'contrato': 'El contrato ya está finiquitado.'})
        if d['fecha_termino'] < c.fecha_inicio:
            raise serializers.ValidationError({'fecha_termino': 'La fecha de término no puede ser anterior al inicio del contrato.'})
        return d

    def montos(self):
        d = self.validated_data
        return montos_para(d['contrato'], d['causal_despido'], d['fecha_termino'], d['dias_vacaciones_pendientes'], d['aviso_previo_dado'])

    def crear(self, user):
        d, m = self.validated_data, self.montos()
        return Finiquito.objects.create(
            contrato=d['contrato'], causal_despido=d['causal_despido'], fecha_termino=d['fecha_termino'], aviso_previo_dado=d['aviso_previo_dado'],
            dias_vacaciones_pendientes=d['dias_vacaciones_pendientes'], monto_indemnizacion=m.indemnizacion, monto_total=m.total, creado_por=user)


class EdicionFiniquitoSerializer(serializers.ModelSerializer):
    """RR. HH. corrige los datos del cálculo mientras está pendiente. Nunca toca el pago."""
    class Meta:
        model = Finiquito
        fields = ['causal_despido', 'fecha_termino', 'aviso_previo_dado', 'dias_vacaciones_pendientes']

    def validate(self, d):
        f = self.instance
        if f.estado_pago != Finiquito.EstadoPago.PENDIENTE:
            raise serializers.ValidationError('Un finiquito pagado no se puede modificar.')
        if d.get('fecha_termino') and d['fecha_termino'] < f.contrato.fecha_inicio:
            raise serializers.ValidationError({'fecha_termino': 'La fecha de término no puede ser anterior al inicio del contrato.'})
        return d

    def update(self, f, d):
        for k, v in d.items():
            setattr(f, k, v)
        m = montos_para(f.contrato, f.causal_despido, f.fecha_termino, f.dias_vacaciones_pendientes, f.aviso_previo_dado)
        f.monto_indemnizacion, f.monto_total = m.indemnizacion, m.total
        f.save()
        return f


class PagoFiniquitoSerializer(serializers.ModelSerializer):
    """Finanzas: solo `estado_pago` y `comprobante_pago`. El resto del finiquito es inalcanzable desde aquí."""
    comprobante_pago = serializers.FileField(required=False)
    estado_pago = serializers.ChoiceField(choices=[Finiquito.EstadoPago.PAGADO])

    class Meta:
        model = Finiquito
        fields = ['estado_pago', 'comprobante_pago']

    def validate_comprobante_pago(self, f):
        return archivos.validar_archivo(f, ['pdf', 'png', 'jpg', 'jpeg'])

    def validate(self, d):
        f = self.instance
        if f.estado_pago == Finiquito.EstadoPago.PAGADO:
            raise serializers.ValidationError('Este finiquito ya está pagado y no se puede modificar.')
        if not (d.get('comprobante_pago') or f.comprobante_pago):
            raise serializers.ValidationError({'comprobante_pago': 'Adjunta el comprobante de transferencia para marcarlo como pagado.'})
        return d

    @transaction.atomic
    def update(self, f, d):
        if d.get('comprobante_pago'):
            f.comprobante_pago = d['comprobante_pago']
        f.estado_pago = Finiquito.EstadoPago.PAGADO
        f.pagado_por = self.context['request'].user
        f.pagado_en = timezone.now()
        f.save()
        c = f.contrato
        c.estado, c.fecha_termino = Contrato.Estado.FINIQUITADO, f.fecha_termino
        c.save(update_fields=['estado', 'fecha_termino'])
        return f


CAMPOS_PAGO = {'estado_pago', 'comprobante_pago'}


def serializer_de_edicion(request, finiquito, data):
    """Elige qué se puede cambiar según quién llama. Mezclar pago y edición se rechaza explícitamente."""
    pide_pago = bool(CAMPOS_PAGO & set(data))
    rol = request.user.role
    if rol == Role.RRHH:
        if pide_pago:
            raise PermissionDenied('Recursos Humanos no puede modificar el pago del finiquito.')
        return EdicionFiniquitoSerializer
    if rol == Role.FINANZAS:
        if set(data) - CAMPOS_PAGO:
            raise PermissionDenied('Finanzas solo puede registrar el pago y su comprobante.')
        return PagoFiniquitoSerializer
    if pide_pago and set(data) - CAMPOS_PAGO:
        raise serializers.ValidationError('Edita el cálculo o registra el pago, no ambos a la vez.')
    return PagoFiniquitoSerializer if pide_pago else EdicionFiniquitoSerializer


class PersonalSerializer(serializers.ModelSerializer):
    """Fila de la tabla de personal: persona + estado contractual vigente (o el último)."""
    nombre = serializers.SerializerMethodField()
    contrato = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ['id', 'nombre', 'email', 'role', 'is_active', 'contrato']

    def get_nombre(self, u):
        return nombre_de(u)

    def get_contrato(self, u):
        c = next(iter(u.contratos.all()), None)  # prefetch ordenado: el más reciente primero
        if not c:
            return None
        f = getattr(c, 'finiquito', None)
        return {'id': c.id, 'tipo_contrato': c.tipo_contrato, 'estado': c.estado, 'fecha_inicio': c.fecha_inicio, 'fecha_termino': c.fecha_termino,
                'sueldo_base': c.sueldo_base, 'finiquito_id': f.id if f else None, 'finiquito_pago': f.estado_pago if f else None}


class DocumentoLaboralSerializer(serializers.ModelSerializer):
    """RR. HH. / Admin: ven toda la evidencia de la firma. El archivo se baja solo por la vista con permisos."""
    trabajador_nombre = serializers.SerializerMethodField()
    tiene_firma = serializers.SerializerMethodField()
    tiene_firmado = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoLaboral
        fields = ['id', 'trabajador', 'trabajador_nombre', 'tipo_documento', 'titulo', 'archivo_pdf', 'estado', 'creado_en',
                  'fecha_firma', 'ip_firma', 'hash_pdf', 'hash_firmado', 'tiene_firma', 'tiene_firmado']
        read_only_fields = ['estado', 'creado_en', 'fecha_firma', 'ip_firma', 'hash_pdf', 'hash_firmado']
        extra_kwargs = {'archivo_pdf': {'write_only': True}}

    def get_trabajador_nombre(self, d):
        return nombre_de(d.trabajador)

    def get_tiene_firma(self, d):
        return bool(d.firma_imagen)

    def get_tiene_firmado(self, d):
        return bool(d.archivo_firmado)

    def validate_trabajador(self, u):
        if not u.is_active:
            raise serializers.ValidationError('El trabajador está inactivo.')
        return u

    def validate_archivo_pdf(self, f):
        archivos.validar_archivo(f, ['pdf'])
        try:
            sellado.revisar_pdf(f)
        except sellado.PdfInvalido as e:
            raise serializers.ValidationError(str(e))
        return f

    def create(self, datos):
        datos['hash_pdf'] = archivos.sha256(datos['archivo_pdf'])
        return super().create(datos)


class MiDocumentoSerializer(serializers.ModelSerializer):
    """Lo que ve el trabajador: sin IP, huella ni datos de otros."""
    class Meta:
        model = DocumentoLaboral
        fields = ['id', 'tipo_documento', 'titulo', 'estado', 'creado_en', 'fecha_firma', 'tiene_firmado']
        read_only_fields = fields

    tiene_firmado = serializers.SerializerMethodField()

    def get_tiene_firmado(self, d):
        return bool(d.archivo_firmado)


MAX_FIRMA_BYTES = 512 * 1024
MAX_FIRMA_LADO = 4000


class FirmaSerializer(serializers.Serializer):
    """Imagen PNG en Base64 (data URL o Base64 plano) con el trazo. Se valida el contenido real, no solo el texto."""
    firma = serializers.CharField(write_only=True, max_length=MAX_FIRMA_BYTES * 2)
    codigo_2fa = serializers.RegexField(r'^\d{6}$', write_only=True, error_messages={'invalid': 'El código debe tener 6 dígitos.'})

    def validate_firma(self, valor):
        import base64
        import binascii
        import io

        from PIL import Image, UnidentifiedImageError
        if valor.startswith('data:'):
            cabecera, _, valor = valor.partition(',')
            if cabecera.lower() != 'data:image/png;base64':
                raise serializers.ValidationError('La firma debe ser una imagen PNG.')
        try:
            crudo = base64.b64decode(valor, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError('La firma no es una imagen Base64 válida.')
        if len(crudo) > MAX_FIRMA_BYTES:
            raise serializers.ValidationError('La imagen de la firma es demasiado grande.')
        try:
            img = Image.open(io.BytesIO(crudo))
            img.load()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise serializers.ValidationError('La firma no es una imagen válida.')
        if img.format != 'PNG' or max(img.size) > MAX_FIRMA_LADO or min(img.size) < 20:
            raise serializers.ValidationError('La firma debe ser un PNG de tamaño razonable.')
        rgba = img.convert('RGBA')
        opacos = sum(1 for p in rgba.getdata() if p[3] > 0 and (p[0] < 250 or p[1] < 250 or p[2] < 250))
        if opacos < 30:
            raise serializers.ValidationError('La firma está en blanco: dibuja tu firma antes de enviarla.')
        return crudo
