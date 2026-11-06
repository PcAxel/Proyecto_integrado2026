from decimal import Decimal

from django.conf import settings
from django.db import models


class Presupuesto(models.Model):
    class Estado(models.TextChoices):
        BORRADOR = 'BORRADOR', 'Borrador'
        ENVIADO = 'ENVIADO', 'Enviado'
        APROBADO = 'APROBADO', 'Aprobado'
        RECHAZADO = 'RECHAZADO', 'Rechazado'

    codigo = models.CharField(max_length=30, unique=True)
    cliente = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.BORRADOR)
    costo_estimado = models.DecimalField(max_digits=14, decimal_places=0, default=0)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.codigo

    @property
    def monto_neto(self):
        return sum((i.subtotal for i in self.items.all()), Decimal('0'))

    @property
    def margen_pct(self):
        neto = self.monto_neto
        if not neto:
            return Decimal('0')
        return ((neto - self.costo_estimado) / neto * 100).quantize(Decimal('0.1'))


class PresupuestoItem(models.Model):
    presupuesto = models.ForeignKey(Presupuesto, related_name='items', on_delete=models.CASCADE)
    descripcion = models.CharField(max_length=255)
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=0)

    @property
    def subtotal(self):
        return self.cantidad * self.precio_unitario
