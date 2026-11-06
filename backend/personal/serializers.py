from rest_framework import serializers

from .models import Trabajador


class TrabajadorSerializer(serializers.ModelSerializer):
    nombre = serializers.SerializerMethodField()
    costo_hora_hombre = serializers.IntegerField(source='tarifa_hora', min_value=0, required=False)

    class Meta:
        model = Trabajador
        fields = ('id', 'rut', 'nombres', 'apellidos', 'nombre', 'cargo', 'costo_hora_hombre',
                  'fecha_ingreso', 'vencimiento_licencia', 'activo', 'usuario')

    def get_nombre(self, obj):
        return f'{obj.nombres} {obj.apellidos}'.strip()
