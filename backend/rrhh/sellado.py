"""Sellado del PDF firmado: el documento original más una hoja de constancia con la firma, el firmante y la evidencia.
El original no se modifica ni se reemplaza: el sellado es un archivo nuevo."""
import io
from zoneinfo import ZoneInfo

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

SANTIAGO = ZoneInfo('America/Santiago')
MAX_PAGINAS = 150


class PdfInvalido(Exception):
    pass


def revisar_pdf(archivo):
    """Un PDF cifrado o corrupto no se puede sellar: se rechaza al subirlo, no el día de la firma."""
    archivo.seek(0)
    try:
        lector = PdfReader(archivo)
        if lector.is_encrypted:
            raise PdfInvalido('El PDF está protegido con contraseña. Súbelo sin cifrar.')
        n = len(lector.pages)
    except PdfInvalido:
        raise
    except Exception:
        raise PdfInvalido('No se pudo leer el PDF. Verifica que no esté dañado.')
    finally:
        archivo.seek(0)
    if n < 1 or n > MAX_PAGINAS:
        raise PdfInvalido(f'El PDF debe tener entre 1 y {MAX_PAGINAS} páginas.')


def _constancia(*, doc, firmante, firma_png, ip, fecha, hash_original, hash_firma):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    ancho, alto = A4
    x, y = 20 * mm, alto - 25 * mm
    c.setFont('Helvetica-Bold', 16)
    c.drawString(x, y, 'Constancia de firma electrónica')
    c.setFont('Helvetica', 9)
    c.drawString(x, y - 6 * mm, 'Firma electrónica simple · Ley N° 19.799 · FYAG SpA')
    c.line(x, y - 9 * mm, ancho - 20 * mm, y - 9 * mm)
    local = fecha.astimezone(SANTIAGO)
    filas = [
        ('Documento', f'{doc.get_tipo_documento_display()}' + (f' · {doc.titulo}' if doc.titulo else '') + f' (N° {doc.id})'),
        ('Firmante', firmante.full_name or firmante.email),
        ('Correo del firmante', firmante.email),
        ('Fecha y hora (Chile)', local.strftime('%d-%m-%Y %H:%M:%S %Z')),
        ('Fecha y hora (UTC)', fecha.strftime('%Y-%m-%dT%H:%M:%SZ')),
        ('Dirección IP', ip or 'No disponible'),
        ('Identidad verificada con', 'Sesión autenticada + código de doble factor (2FA) del firmante'),
    ]
    y -= 20 * mm
    for k, v in filas:
        c.setFont('Helvetica-Bold', 9)
        c.drawString(x, y, k)
        c.setFont('Helvetica', 9)
        c.drawString(x + 48 * mm, y, v[:95])
        y -= 7 * mm
    y -= 4 * mm
    c.setFont('Helvetica-Bold', 9)
    c.drawString(x, y, 'Huella SHA-256 del documento original')
    c.setFont('Courier', 8)
    c.drawString(x, y - 5 * mm, hash_original)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(x, y - 12 * mm, 'Huella SHA-256 del trazo de la firma')
    c.setFont('Courier', 8)
    c.drawString(x, y - 17 * mm, hash_firma)
    y -= 30 * mm
    c.setFont('Helvetica-Bold', 9)
    c.drawString(x, y, 'Firma manuscrita digital (trazada para este documento)')
    caja_alto = 45 * mm
    c.rect(x, y - 4 * mm - caja_alto, 90 * mm, caja_alto)
    c.drawImage(ImageReader(io.BytesIO(firma_png)), x + 2 * mm, y - 2 * mm - caja_alto, width=86 * mm, height=caja_alto - 4 * mm,
                preserveAspectRatio=True, anchor='c', mask='auto')
    c.setFont('Helvetica', 7.5)
    c.drawString(x, 20 * mm, 'La firma fue trazada únicamente para este documento y no se reutiliza. Para verificar la integridad, calcule el SHA-256')
    c.drawString(x, 16 * mm, 'del PDF original y compárelo con la huella impresa arriba. Esta hoja se agrega al final del documento sin alterarlo.')
    c.save()
    buf.seek(0)
    return buf


def sellar_pdf(archivo_original, **datos) -> bytes:
    """Devuelve el PDF original con la hoja de constancia al final."""
    archivo_original.seek(0)
    try:
        escritor = PdfWriter(clone_from=PdfReader(archivo_original))
        for pagina in PdfReader(_constancia(**datos)).pages:
            escritor.add_page(pagina)
        escritor.add_metadata({'/Title': f'{datos["doc"].get_tipo_documento_display()} firmado N° {datos["doc"].id}', '/Producer': 'FYAG ERP'})
        salida = io.BytesIO()
        escritor.write(salida)
    except Exception:
        raise PdfInvalido('No se pudo generar el PDF firmado.')
    finally:
        archivo_original.seek(0)
    return salida.getvalue()
