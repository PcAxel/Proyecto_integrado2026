"""Conexión directa a MongoDB con el driver oficial (pymongo). Sin ORM intermedio."""
import threading

import gridfs
from django.conf import settings
from pymongo import ASCENDING, MongoClient

COLECCION = 'evidencias_terreno'
BUCKET_FOTOS = 'fotos_terreno'

_lock = threading.Lock()
_client = None


def get_client():
    """Un único MongoClient por proceso (es thread-safe y mantiene su propio pool)."""
    global _client
    with _lock:
        if _client is None:
            _client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=3000, tz_aware=True)
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
