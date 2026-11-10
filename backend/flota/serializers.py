from django.utils import timezone
from rest_framework import serializers

from accounts.models import CustomUser, Role

from . import servicio
from .models import DocumentoVehiculo, LecturaOdometro, Vehiculo
from .servicio import FlotaError

TIPOS = DocumentoVehiculo.Tipo


def _nombre(u):
    return (u.full_name or u.email) if u else '—'


class VehiculoSerializer(serializers.ModelSerializer):
    """Vehículo con sus vencimientos vigentes. El kilometraje y los vencimientos son de solo lectura: cambian al registrar una lectura
    del odómetro o un documento (con historial), nunca editando el vehículo."""
    km_actual = serializers.IntegerField(source='kilometraje', read_only=True)
    km_inicial = serializers.IntegerField(write_only=True, required=False, min_value=0, max_value=servicio.KM_MAXIMO)
    tecnico_nombre = serializers.SerializerMethodField()
    ultima_revision = serializers.SerializerMethodField()
    vencimiento_revision = serializers.SerializerMethodField()
    vencimiento_permiso = serializers.SerializerMethodField()
    vencimiento_seguro = serializers.SerializerMethodField()
    estado_vencimientos = serializers.SerializerMethodField()

    class Meta:
        model = Vehiculo
        fields = ['id', 'codigo', 'patente', 'marca', 'modelo', 'anio', 'estado', 'activo', 'tecnico', 'tecnico_nombre', 'km_actual', 'km_inicial',
                  'ultima_revision', 'vencimiento_revision', 'vencimiento_permiso', 'vencimiento_seguro', 'estado_vencimientos']
        read_only_fields = ['codigo']

    def _doc(self, v, tipo):
        return servicio.vencimiento_vigente(v, tipo)

    def get_tecnico_nombre(self, v):
        return _nombre(v.tecnico)

    def get_ultima_revision(self, v):
        d = self._doc(v, TIPOS.REVISION_TECNICA)
        return d.fecha_realizacion if d else None

    def get_vencimiento_revision(self, v):
        d = self._doc(v, TIPOS.REVISION_TECNICA)
        return d.fecha_vencimiento if d else None

    def get_vencimiento_permiso(self, v):
        d = self._doc(v, TIPOS.PERMISO_CIRCULACION)
        return d.fecha_vencimiento if d else None

    def get_vencimiento_seguro(self, v):
        d = self._doc(v, TIPOS.SEGURO)
        return d.fecha_vencimiento if d else None

    def get_estado_vencimientos(self, v):
        hoy = timezone.localdate()
        return {'revision': servicio.estado_vencimiento(self.get_vencimiento_revision(v), hoy), 'permiso': servicio.estado_vencimiento(self.get_vencimiento_permiso(v), hoy),
                'seguro': servicio.estado_vencimiento(self.get_vencimiento_seguro(v), hoy)}

    def validate_patente(self, valor):
        try:
            patente = servicio.normalizar_patente(valor)
        except FlotaError as e:
            raise serializers.ValidationError(str(e))
        otros = Vehiculo.objects.filter(patente=patente)
        if self.instance:
            otros = otros.exclude(pk=self.instance.pk)
        if otros.exists():
            raise serializers.ValidationError('Ya existe un vehículo con esa patente.')
        return patente

    def validate_anio(self, anio):
        if anio is not None and not 1980 <= anio <= timezone.localdate().year + 1:
            raise serializers.ValidationError('El año no es válido.')
        return anio

    def validate_tecnico(self, u):
        if u is not None and (u.role != Role.TECNICO or not u.is_active):
            raise serializers.ValidationError('Elige un técnico con la cuenta activa.')
        return u

    def create(self, datos):
        km = datos.pop('km_inicial', 0)
        usuario = self.context['request'].user
        v = super().create(datos)
        if km:
            servicio.registrar_km(v, km, LecturaOdometro.Origen.INICIAL, usuario)
        return v

    def update(self, instance, datos):
        datos.pop('km_inicial', None)  # el kilometraje solo cambia con una lectura
        return super().update(instance, datos)


class DocumentoVehiculoSerializer(serializers.ModelSerializer):
    tipo_texto = serializers.CharField(source='get_tipo_display', read_only=True)
    registrado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoVehiculo
        fields = ['id', 'tipo', 'tipo_texto', 'fecha_realizacion', 'fecha_vencimiento', 'referencia', 'observacion', 'registrado_por_nombre', 'creado_en']
        read_only_fields = ['creado_en']

    def get_registrado_por_nombre(self, d):
        return _nombre(d.registrado_por) if d.registrado_por_id else '—'

    def validate(self, datos):
        try:
            realizada, vence = datos.get('fecha_realizacion'), datos['fecha_vencimiento']
            if realizada and vence < realizada:
                raise FlotaError('El vencimiento no puede ser anterior al día en que se hizo.')
            if realizada and realizada > timezone.localdate():
                raise FlotaError('La fecha en que se hizo no puede ser futura.')
        except FlotaError as e:
            raise serializers.ValidationError({'fecha_vencimiento': str(e)})
        return datos


class LecturaOdometroSerializer(serializers.ModelSerializer):
    origen_texto = serializers.CharField(source='get_origen_display', read_only=True)
    registrado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = LecturaOdometro
        fields = ['id', 'km', 'fecha', 'origen', 'origen_texto', 'referencia', 'registrado_por_nombre']
        read_only_fields = ['fecha', 'origen', 'referencia']

    def get_registrado_por_nombre(self, l):
        return _nombre(l.registrado_por) if l.registrado_por_id else '—'
