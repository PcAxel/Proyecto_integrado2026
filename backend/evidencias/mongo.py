"""Conexión directa a MongoDB con el driver oficial (pymongo). Sin ORM intermedio."""
import hashlib
import threading

import gridfs
from bson import ObjectId
from bson.errors import InvalidId
from django.conf import settings
from django.utils import timezone
from pymongo import ASCENDING, DESCENDING, MongoClient

COLECCION = 'evidencias_terreno'
BUCKET_FOTOS = 'fotos_terreno'

_lock = threading.Lock()
_client = None


def get_client():
    """Un único MongoClient por proceso (es thread-safe y mantiene su propio pool)."""
    global _client
    with _lock:
        if _client is None:
            _client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=settings.MONGO_TIMEOUT_MS, tz_aware=True)
        return _client


def get_db():
    return get_client()[settings.MONGO_DB_NAME]


def get_evidencias():
    return get_db()[COLECCION]


def get_fotos_bucket():
    return gridfs.GridFSBucket(get_db(), bucket_name=BUCKET_FOTOS)


def ensure_indexes():
    col = get_evidencias()
    col.create_index([('obra_id', ASCENDING), ('capturada_en', ASCENDING)])
    col.create_index([('tecnico_id', ASCENDING)])


def ping():
    """Lanza excepción si el servidor no responde."""
    return get_client().admin.command('ping')


# --- Evidencia fotográfica: la foto va a GridFS y su documento de metadatos a la colección `evidencias_terreno` ---

def crear(*, obra_id, tecnico_id, foto_bytes, content_type, gps, descripcion='', capturada_en=None, dispositivo=None):
    """Guarda la foto en GridFS y sus metadatos en un documento. Devuelve el documento (con `_id`).

    Si falla el documento, la foto recién subida se borra: no quedan archivos huérfanos.
    """
    ahora = timezone.now()
    file_id = get_fotos_bucket().upload_from_stream(
        f'{obra_id}-{ahora:%Y%m%dT%H%M%S}', foto_bytes, metadata={'content_type': content_type})
    doc = {
        'obra_id': obra_id,
        'tecnico_id': tecnico_id,
        'descripcion': descripcion,
        'gps': gps,
        'capturada_en': capturada_en or ahora,
        'subida_en': ahora,
        'dispositivo': dispositivo or {},
        'foto': {'file_id': file_id, 'content_type': content_type, 'size': len(foto_bytes),
                 'sha256': hashlib.sha256(foto_bytes).hexdigest()},
    }
    try:
        doc['_id'] = get_evidencias().insert_one(doc).inserted_id
    except Exception:
        get_fotos_bucket().delete(file_id)
        raise
    return doc


def obtener(evidencia_id):
    """Documento de metadatos, o None si el id no es válido o no existe."""
    try:
        return get_evidencias().find_one({'_id': ObjectId(evidencia_id)})
    except (InvalidId, TypeError):
        return None


def leer_foto(doc):
    """Bytes de la foto de una evidencia, o None si el archivo ya no está en GridFS."""
    try:
        return get_fotos_bucket().open_download_stream(doc['foto']['file_id']).read()
    except gridfs.NoFile:
        return None


def listar_por_obra(obra_id, tecnico_id=None, limite=100):
    """Metadatos de las evidencias de una obra, de la más reciente a la más antigua (sin los bytes de la foto)."""
    filtro = {'obra_id': obra_id}
    if tecnico_id is not None:
        filtro['tecnico_id'] = tecnico_id
    return list(get_evidencias().find(filtro).sort('capturada_en', DESCENDING).limit(limite))


def eliminar(evidencia_id):
    """Borra el documento y su foto. Devuelve False si no existía."""
    doc = obtener(evidencia_id)
    if doc is None:
        return False
    get_evidencias().delete_one({'_id': doc['_id']})
    try:
        get_fotos_bucket().delete(doc['foto']['file_id'])
    except gridfs.NoFile:
        pass
    return True
