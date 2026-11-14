from django.conf import settings
from django.db import models
from django.db.models import Q


class FacturaDTE(models.Model):
    """Factura electrónica (DTE) de una orden de trabajo (obra del ERP). Hay UNA por orden: la restricción única impide emitirla dos veces.

    Guarda además una foto de los datos tributarios con que se emitió (receptor y montos): lo que se emite no cambia aunque después se edite el cliente o el presupuesto.
    El estado y el folio solo los escribe el servidor tras la respuesta del proveedor."""

    class EstadoSII(models.TextChoices):
        NO_EMITIDO = 'NO_EMITIDO', 'No Emitido'
        PROCESANDO = 'PROCESANDO', 'Procesando'
        ACEPTADO = 'ACEPTADO', 'Aceptado'
        RECHAZADO = 'RECHAZADO', 'Rechazado'

    orden_id = models.CharField(max_length=30, unique=True, help_text='Id de la obra en el ERP («OB-0003»), que es la orden de trabajo que se factura')
    folio_sii = models.PositiveIntegerField(null=True, blank=True, unique=True)
    estado_sii = models.CharField(max_length=12, choices=EstadoSII.choices, default=EstadoSII.NO_EMITIDO)
    xml_timbre = models.TextField(null=True, blank=True)
    pdf_url = models.URLField(max_length=300, null=True, blank=True, help_text='Ruta de descarga autenticada del PDF (no es una URL pública)')
    pdf_archivo = models.CharField(max_length=200, blank=True, help_text='Ubicación del PDF en el almacenamiento privado')

    receptor_rut = models.CharField(max_length=12, blank=True)
    receptor_razon_social = models.CharField(max_length=200, blank=True)
    glosa = models.CharField(max_length=300, blank=True)
    monto_neto = models.PositiveBigIntegerField(default=0)
    monto_iva = models.PositiveBigIntegerField(default=0)
    monto_total = models.PositiveBigIntegerField(default=0)

    error = models.CharField(max_length=300, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    emitido_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado_en']
        verbose_name = 'factura electrónica (DTE)'
        verbose_name_plural = 'facturas electrónicas (DTE)'
        constraints = [
            # Una factura aceptada siempre tiene folio y PDF, aunque alguien escriba directo en la base.
            models.CheckConstraint(condition=~Q(estado_sii='ACEPTADO') | (Q(folio_sii__isnull=False) & ~Q(pdf_archivo='')), name='aceptada_exige_folio_y_pdf'),
        ]

    def __str__(self):
        return f'DTE {self.orden_id} · {self.get_estado_sii_display()}' + (f' · folio {self.folio_sii}' if self.folio_sii else '')
