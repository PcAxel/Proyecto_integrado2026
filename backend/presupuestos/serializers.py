from rest_framework import serializers

from .models import Presupuesto, PresupuestoItem


class PresupuestoItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = PresupuestoItem
        fields = ('id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal')


class PresupuestoSerializer(serializers.ModelSerializer):
    items = PresupuestoItemSerializer(many=True, required=False)
    monto_neto = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    margen_pct = serializers.DecimalField(max_digits=6, decimal_places=1, read_only=True)

    class Meta:
        model = Presupuesto
        fields = ('id', 'codigo', 'cliente', 'descripcion', 'estado', 'costo_estimado',
                  'monto_neto', 'margen_pct', 'items', 'created_at')
        read_only_fields = ('created_at',)

    def create(self, validated):
        items = validated.pop('items', [])
        presupuesto = Presupuesto.objects.create(creado_por=self.context['request'].user, **validated)
        PresupuestoItem.objects.bulk_create(PresupuestoItem(presupuesto=presupuesto, **i) for i in items)
        return presupuesto

    MARGEN_MINIMO = 20

    def update(self, instance, validated):
        items = validated.pop('items', None)
        user = self.context['request'].user
        if validated.get('estado') == Presupuesto.Estado.APROBADO and instance.estado != Presupuesto.Estado.APROBADO:
            if instance.margen_pct < self.MARGEN_MINIMO and user.role != 'ADMIN':
                raise serializers.ValidationError(
                    {'estado': f'Con margen bajo {self.MARGEN_MINIMO} % solo el Administrador puede aprobar.'})
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if items is not None:
            instance.items.all().delete()
            PresupuestoItem.objects.bulk_create(PresupuestoItem(presupuesto=instance, **i) for i in items)
        return instance
