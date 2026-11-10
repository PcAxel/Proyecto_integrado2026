from django.conf import settings
from django.db import models


class Vehiculo(models.Model):
    class Estado(models.TextChoices):
        ACTIVO = 'ACTIVO', 'Activo'
        EN_TALLER = 'EN_TALLER', 'En taller'

    patente = models.CharField(max_length=10, unique=True)
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)
    anio = models.PositiveSmallIntegerField(null=True, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.ACTIVO)
    tecnico = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='vehiculos')
    kilometraje = models.PositiveIntegerField(default=0)
    activo = models.BooleanField(default=True)
    venc_revision_tecnica = models.DateField(null=True, blank=True)
    venc_permiso_circulacion = models.DateField(null=True, blank=True)
    venc_seguro = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['patente']

    def __str__(self):
        return self.patente
