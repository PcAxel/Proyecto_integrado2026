from rest_framework import serializers

from .models import Vehiculo


class VehiculoSerializer(serializers.ModelSerializer):
    km_actual = serializers.IntegerField(source='kilometraje', min_value=0, required=False)
    vencimiento_revision = serializers.DateField(source='venc_revision_tecnica', required=False, allow_null=True)
    vencimiento_permiso = serializers.DateField(source='venc_permiso_circulacion', required=False, allow_null=True)
    vencimiento_seguro = serializers.DateField(source='venc_seguro', required=False, allow_null=True)
    tecnico_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Vehiculo
        fields = ('id', 'patente', 'marca', 'modelo', 'anio', 'estado', 'km_actual', 'vencimiento_revision',
                  'vencimiento_permiso', 'vencimiento_seguro', 'tecnico', 'tecnico_nombre', 'activo')

    def get_tecnico_nombre(self, obj):
        return f'{obj.tecnico.nombres} {obj.tecnico.apellidos}' if obj.tecnico else '—'

    def validate_patente(self, value):
        return value.upper().replace(' ', '')
