from rest_framework import serializers

from .models import Obra, ReporteTerreno


class ObraSerializer(serializers.ModelSerializer):
    presupuesto_codigo = serializers.CharField(source='presupuesto.codigo', read_only=True, default=None)

    class Meta:
        model = Obra
        fields = ('id', 'codigo', 'nombre', 'cliente', 'direccion', 'estado', 'presupuesto', 'presupuesto_codigo',
                  'supervisor', 'fecha_inicio', 'fecha_fin', 'created_at')
        read_only_fields = ('created_at',)

    def validate(self, attrs):
        inicio = attrs.get('fecha_inicio', getattr(self.instance, 'fecha_inicio', None))
        fin = attrs.get('fecha_fin', getattr(self.instance, 'fecha_fin', None))
        if inicio and fin and fin < inicio:
            raise serializers.ValidationError({'fecha_fin': 'No puede ser anterior al inicio.'})
        return attrs


class ReporteTerrenoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReporteTerreno
        fields = ('id', 'obra_id', 'tecnico', 'descripcion', 'evidencia_id', 'created_at')
        read_only_fields = fields
