from django.db import transaction
from rest_framework import serializers

from .models import Articulo, MovimientoCardex


class ArticuloSerializer(serializers.ModelSerializer):
    class Meta:
        model = Articulo
        fields = ('id', 'codigo', 'nombre', 'unidad', 'stock', 'stock_minimo', 'costo_unitario', 'activo')
        read_only_fields = ('stock',)


class MovimientoSerializer(serializers.ModelSerializer):
    articulo_codigo = serializers.CharField(source='articulo.codigo', read_only=True)
    articulo_nombre = serializers.CharField(source='articulo.nombre', read_only=True)
    obra_codigo = serializers.CharField(source='obra.codigo', read_only=True, default=None)
    usuario_email = serializers.CharField(source='usuario.email', read_only=True)

    class Meta:
        model = MovimientoCardex
        fields = ('id', 'articulo', 'articulo_codigo', 'articulo_nombre', 'tipo', 'cantidad', 'obra', 'obra_codigo',
                  'referencia', 'usuario', 'usuario_email', 'saldo', 'created_at')
        read_only_fields = ('usuario', 'saldo', 'created_at')

    def validate(self, attrs):
        tipo, cantidad = attrs['tipo'], attrs['cantidad']
        if cantidad == 0:
            raise serializers.ValidationError({'cantidad': 'No puede ser cero.'})
        if tipo != MovimientoCardex.Tipo.AJUSTE and cantidad < 0:
            raise serializers.ValidationError({'cantidad': 'Debe ser positiva (use AJUSTE para restar).'})
        if tipo == MovimientoCardex.Tipo.SALIDA and not attrs.get('obra'):
            raise serializers.ValidationError({'obra': 'Una salida debe indicar la obra de destino.'})
        return attrs

    @transaction.atomic
    def create(self, validated):
        # Bloqueo de fila para que dos movimientos simultáneos no corrompan el saldo.
        articulo = Articulo.objects.select_for_update().get(pk=validated['articulo'].pk)
        if not articulo.activo:
            raise serializers.ValidationError({'articulo': 'El artículo está desactivado.'})
        delta = -validated['cantidad'] if validated['tipo'] == MovimientoCardex.Tipo.SALIDA else validated['cantidad']
        nuevo = articulo.stock + delta
        if nuevo < 0:
            raise serializers.ValidationError({'cantidad': f'Stock insuficiente (disponible: {articulo.stock}).'})
        articulo.stock = nuevo
        articulo.save(update_fields=['stock'])
        return MovimientoCardex.objects.create(usuario=self.context['request'].user, saldo=nuevo, **validated)
