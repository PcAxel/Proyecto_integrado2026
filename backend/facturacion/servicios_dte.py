"""Capa de servicios de facturación electrónica: PATRÓN ADAPTADOR.

El resto del sistema habla SOLO con `ProveedorDTEBase`. Hoy el único proveedor es `ProveedorSimulado`; cuando se contrate un proveedor real autorizado por el SII
(o se integre directo con el SII) se escribe otra clase hija con el mismo contrato y se elige con `DTE_PROVEEDOR` en la configuración: ni las vistas ni el modelo cambian.

Contrato de `emitir(datos)` → dict:
  {'exito': bool, 'folio_sii': int, 'pdf_url': str, 'pdf_archivo': str, 'xml_timbre': str|None, 'error': str}   (`error` solo si `exito` es False)
"""
import io
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

# PDFs en almacenamiento PRIVADO (sin URL pública): solo se entregan por una vista que comprueba el permiso.
almacen_dte = FileSystemStorage(location=settings.ARCHIVOS_PRIVADOS)


@dataclass(frozen=True)
class DatosFactura:
    """Lo que necesita cualquier proveedor para emitir. Es una foto: no cambia aunque se edite la orden después."""
    orden_id: str
    receptor_rut: str
    receptor_razon_social: str
    glosa: str
    neto: int
    iva: int
    total: int
    url_descarga: str          # ruta autenticada donde se descargará el PDF (la fija la API, no el proveedor)
    folio_sugerido: int        # solo lo usa el simulador; un proveedor real recibe el folio del SII
    fecha: date


class ProveedorDTEBase(ABC):
    """Interfaz común de todos los proveedores de DTE."""

    @abstractmethod
    def emitir(self, datos: DatosFactura) -> dict:
        """Emite la factura y devuelve el dict del contrato. Nunca debe lanzar por un rechazo del proveedor: debe devolver `exito=False` con su `error`."""


def _clp(n):
    return '$' + f'{int(n):,}'.replace(',', '.')


def generar_pdf_dte(datos: DatosFactura, folio: int, simulado: bool = True) -> bytes:
    """PDF básico de la factura con reportlab. Si es simulado, lo dice en grande: no tiene ninguna validez tributaria."""
    emisor = settings.DTE_EMISOR
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    ancho, alto = A4
    marino = colors.HexColor('#0B2A3F')
    if simulado:  # marca de agua diagonal
        c.saveState()
        c.setFillColor(colors.Color(0.8, 0.1, 0.1, alpha=0.12))
        c.setFont('Helvetica-Bold', 64)
        c.translate(ancho / 2, alto / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, 'SIMULADO')
        c.restoreState()
    c.setFillColor(marino)
    c.setFont('Helvetica-Bold', 14)
    c.drawString(40, alto - 50, emisor['razon_social'])
    c.setFont('Helvetica', 9)
    c.setFillColor(colors.black)
    c.drawString(40, alto - 66, f"R.U.T.: {emisor['rut']}")
    c.drawString(40, alto - 78, emisor['giro'])
    c.drawString(40, alto - 90, emisor['direccion'])
    c.setStrokeColor(colors.HexColor('#C6601F'))
    c.setLineWidth(2)
    c.rect(ancho - 230, alto - 100, 190, 76)
    c.setFont('Helvetica-Bold', 10)
    c.setFillColor(colors.HexColor('#C6601F'))
    c.drawCentredString(ancho - 135, alto - 42, f"R.U.T.: {emisor['rut']}")
    c.drawCentredString(ancho - 135, alto - 60, 'FACTURA ELECTRÓNICA')
    c.drawCentredString(ancho - 135, alto - 78, f'N° {folio}')
    c.setFont('Helvetica', 8)
    c.drawCentredString(ancho - 135, alto - 92, 'S.I.I. — SIMULACIÓN' if simulado else 'S.I.I.')

    c.setFillColor(colors.black)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(40, alto - 140, 'Señor(es)')
    c.setFont('Helvetica', 10)
    c.drawString(120, alto - 140, datos.receptor_razon_social[:70])
    c.drawString(40, alto - 156, 'R.U.T.')
    c.drawString(120, alto - 156, datos.receptor_rut)
    c.drawString(40, alto - 172, 'Fecha emisión')
    c.drawString(120, alto - 172, datos.fecha.strftime('%d-%m-%Y'))
    c.drawString(40, alto - 188, 'Orden')
    c.drawString(120, alto - 188, datos.orden_id)

    y = alto - 235
    c.setFillColor(marino)
    c.rect(40, y, ancho - 80, 20, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(48, y + 6, 'Descripción')
    c.drawRightString(ancho - 48, y + 6, 'Monto neto')
    c.setFillColor(colors.black)
    c.setFont('Helvetica', 10)
    c.drawString(48, y - 16, datos.glosa[:90])
    c.drawRightString(ancho - 48, y - 16, _clp(datos.neto))
    c.line(40, y - 28, ancho - 40, y - 28)

    y -= 60
    for etiqueta, valor, negrita in (('Monto neto', datos.neto, False), ('IVA (19 %)', datos.iva, False), ('TOTAL', datos.total, True)):
        c.setFont('Helvetica-Bold' if negrita else 'Helvetica', 11 if negrita else 10)
        c.drawString(ancho - 230, y, etiqueta)
        c.drawRightString(ancho - 48, y, _clp(valor))
        y -= 18
    c.setFont('Helvetica-Oblique', 8)
    c.setFillColor(colors.HexColor('#666666'))
    if simulado:
        c.drawString(40, 60, 'Documento generado por un proveedor SIMULADO para pruebas y demostración. NO tiene validez tributaria ni fue enviado al SII.')
    c.drawString(40, 48, f'Generado por FYAG ERP · orden {datos.orden_id}')
    c.showPage()
    c.save()
    return buf.getvalue()


def guardar_pdf(contenido: bytes) -> str:
    """Escribe el PDF en el almacenamiento privado y devuelve su ruta relativa."""
    return almacen_dte.save(f'dtes/{uuid.uuid4().hex}.pdf', ContentFile(contenido))


class ProveedorSimulado(ProveedorDTEBase):
    """Proveedor de pruebas: espera lo que tardaría la red, genera un PDF básico y responde que el SII aceptó el documento. No envía nada a nadie."""

    def emitir(self, datos: DatosFactura) -> dict:
        time.sleep(settings.DTE_SIMULADO_RETRASO)  # emula la red; configurable (las pruebas lo ponen en 0)
        archivo = guardar_pdf(generar_pdf_dte(datos, datos.folio_sugerido, simulado=True))
        return {'exito': True, 'folio_sii': datos.folio_sugerido, 'pdf_url': datos.url_descarga, 'pdf_archivo': archivo, 'xml_timbre': None}


_PROVEEDORES = {'simulado': ProveedorSimulado}


def obtener_proveedor() -> ProveedorDTEBase:
    """Proveedor configurado en `DTE_PROVEEDOR` (por defecto el simulado). Un nombre desconocido es un error de configuración y se detiene."""
    try:
        return _PROVEEDORES[settings.DTE_PROVEEDOR]()
    except KeyError:
        raise RuntimeError(f'DTE_PROVEEDOR desconocido: {settings.DTE_PROVEEDOR!r}. Opciones: {", ".join(_PROVEEDORES)}.')
