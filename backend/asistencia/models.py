from django.db import models


class MarcaAsistencia(models.Model):
    """Reloj control. Cada marca es inmutable: la jornada se reconstruye leyendo las marcas del día."""
    class Tipo(models.TextChoices):
        ENTRADA = 'ENTRADA', 'Entrada'
        SALIDA = 'SALIDA', 'Salida'

    trabajador = models.ForeignKey('personal.Trabajador', on_delete=models.PROTECT, related_name='marcas')
    tipo = models.CharField(max_length=8, choices=Tipo.choices)
    fecha = models.DateTimeField()  # la captura el dispositivo; puede llegar tarde si no había señal
    lat = models.FloatField()
    lng = models.FloatField()
    obra = models.ForeignKey('obras.Obra', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    client_id = models.CharField(max_length=64, unique=True, null=True, blank=True)  # idempotencia de reintentos
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fecha', 'id']
