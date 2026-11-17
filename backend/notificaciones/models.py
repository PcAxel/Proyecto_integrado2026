from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Aviso para una persona (la «campanita»). Lo crea el servidor al ocurrir un hito del flujo; la persona solo lo lee y lo marca como leído."""

    class Tipo(models.TextChoices):
        FACTURACION_LISTA = 'FACTURACION_LISTA', 'Obra lista para facturar'
        BODEGA_APROBADA = 'BODEGA_APROBADA', 'Bodega aprobada'
        OBRA_DELEGADA = 'OBRA_DELEGADA', 'Obra delegada a terreno'
        GENERAL = 'GENERAL', 'General'

    usuario_destino = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notificaciones')
    mensaje = models.TextField()
    tipo = models.CharField(max_length=30, choices=Tipo.choices, default=Tipo.GENERAL)
    leida = models.BooleanField(default=False)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_creacion', '-id']
        indexes = [models.Index(fields=['usuario_destino', 'leida'])]

    def __str__(self):
        return f'{self.tipo} → {self.usuario_destino_id}: {self.mensaje[:40]}'


def notificar(usuarios, mensaje, tipo=Notification.Tipo.GENERAL):
    """Crea un aviso por cada persona (una sola consulta). Devuelve cuántos creó."""
    filas = [Notification(usuario_destino=u, mensaje=mensaje, tipo=tipo) for u in usuarios]
    Notification.objects.bulk_create(filas)
    return len(filas)
