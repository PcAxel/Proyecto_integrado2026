from django.db import models


class Registro(models.Model):
    """Fila de una tabla del ERP (clientes, obras, cardex…) con la misma forma que usa el frontend.

    Las tablas de negocio comparten esta estructura para conservar el modelo de datos original de la app;
    lo que hace cumplir el servidor (permisos por rol, libros inmutables, reglas de stock, auditoría) vive en
    `tablas.py` y `reglas.py`, no en el cliente.
    """
    tabla = models.CharField(max_length=30)
    rid = models.CharField(max_length=30)  # id público: «OB-0004», «MOV-000012»…
    datos = models.JSONField()
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tabla', 'rid'], name='registro_unico_por_tabla')]
        indexes = [models.Index(fields=['tabla', 'creado'])]
        ordering = ['id']

    def fila(self):
        return {**self.datos, 'id': self.rid}
