from django.conf import settings
from django.db import models


class Obra(models.Model):
    class Estado(models.TextChoices):
        PLANIFICADA = 'PLANIFICADA', 'Planificada'
        EN_CURSO = 'EN_CURSO', 'En curso'
        FINALIZADA = 'FINALIZADA', 'Finalizada'

    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=200)
    cliente = models.CharField(max_length=200)
    direccion = models.CharField(max_length=255, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PLANIFICADA)
    presupuesto = models.ForeignKey('presupuestos.Presupuesto', null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='obras')
    supervisor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='obras_supervisadas')
    fecha_inicio = models.DateField(null=True, blank=True)
    fecha_fin = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.codigo} {self.nombre}'


class ReporteTerreno(models.Model):
    """Reporte de un técnico. La foto vive en MongoDB; aquí solo su ObjectId (string)."""
    obra_id = models.CharField(max_length=30)  # id de la obra en las tablas del ERP («OB-0004»)
    tecnico = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='reportes')
    descripcion = models.TextField(blank=True)
    evidencia_id = models.CharField(max_length=24, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
