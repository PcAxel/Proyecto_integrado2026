"""Archivos de RR. HH.: almacenamiento privado (sin URL pública) y validación por contenido, no por extensión."""
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.validators import FileExtensionValidator
from rest_framework.exceptions import ValidationError

MAX_BYTES = 10 * 1024 * 1024

almacen_privado = FileSystemStorage(location=settings.ARCHIVOS_PRIVADOS)  # sin base_url: solo se sirve por vistas con permisos

# Firmas de archivo reales: un .pdf renombrado desde otro formato no pasa.
FIRMAS = {'pdf': (b'%PDF-',), 'png': (b'\x89PNG\r\n\x1a\n',), 'jpg': (b'\xff\xd8\xff',), 'jpeg': (b'\xff\xd8\xff',)}


def ruta_documento(instancia, nombre):
    return f'documentos/{uuid.uuid4().hex}.pdf'


def ruta_comprobante(instancia, nombre):
    ext = nombre.rsplit('.', 1)[-1].lower()
    return f'comprobantes/{uuid.uuid4().hex}.{ext}'


validar_ext_pdf = FileExtensionValidator(['pdf'])
validar_ext_comprobante = FileExtensionValidator(['pdf', 'png', 'jpg', 'jpeg'])


def validar_archivo(archivo, extensiones):
    """Tamaño máximo y firma del contenido coherente con la extensión declarada."""
    if archivo.size > MAX_BYTES:
        raise ValidationError('El archivo supera el máximo de 10 MB.')
    ext = archivo.name.rsplit('.', 1)[-1].lower() if '.' in archivo.name else ''
    if ext not in extensiones:
        raise ValidationError(f'Formato no permitido. Usa: {", ".join(extensiones).upper()}.')
    cabecera = archivo.read(8)
    archivo.seek(0)
    if not any(cabecera.startswith(f) for f in FIRMAS[ext]):
        raise ValidationError('El contenido del archivo no corresponde a su formato.')
    return archivo


def ruta_firma(instancia, nombre):
    return f'firmas/{uuid.uuid4().hex}.png'


def sha256(archivo):
    """Huella del contenido: prueba de que el PDF firmado es el mismo que subió RR. HH."""
    import hashlib
    h = hashlib.sha256()
    archivo.seek(0)
    for bloque in iter(lambda: archivo.read(65536), b''):
        h.update(bloque)
    archivo.seek(0)
    return h.hexdigest()


def ruta_firmado(instancia, nombre):
    return f'firmados/{uuid.uuid4().hex}.pdf'
