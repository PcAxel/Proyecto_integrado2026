from django.conf import settings
from django.db import models


class Articulo(models.Model):
    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=200)
    unidad = models.CharField(max_length=10, default='un')
    stock = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)
    stock_minimo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    costo_unitario = models.DecimalField(max_digits=14, decimal_places=0, default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ['codigo']

    def __str__(self):
        return f'{self.codigo} {self.nombre}'


class MovimientoCardex(models.Model):
    """Libro de movimientos. Solo se agrega: un error se corrige con un contra-asiento (AJUSTE)."""
    class Tipo(models.TextChoices):
        ENTRADA = 'ENTRADA', 'Entrada'
        SALIDA = 'SALIDA', 'Salida a obra'
        AJUSTE = 'AJUSTE', 'Ajuste (+/-)'

    articulo = models.ForeignKey(Articulo, on_delete=models.PROTECT, related_name='movimientos')
    tipo = models.CharField(max_length=8, choices=Tipo.choices)
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)  # con signo en AJUSTE
    obra = models.ForeignKey('obras.Obra', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    referencia = models.CharField(max_length=100, blank=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    saldo = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
