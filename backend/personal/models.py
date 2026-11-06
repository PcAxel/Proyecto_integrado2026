from django.conf import settings
from django.db import models


class Trabajador(models.Model):
    rut = models.CharField(max_length=12, unique=True)
    nombres = models.CharField(max_length=150)
    apellidos = models.CharField(max_length=150)
    cargo = models.CharField(max_length=100)
    tarifa_hora = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    fecha_ingreso = models.DateField(null=True, blank=True)
    vencimiento_licencia = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)
    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='trabajador')

    class Meta:
        ordering = ['apellidos', 'nombres']
        verbose_name_plural = 'trabajadores'

    def __str__(self):
        return f'{self.nombres} {self.apellidos}'
