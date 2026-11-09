"""Comprobaciones de las tres bases (PostgreSQL, Valkey, MongoDB), compartidas por el comando y por /api/salud/.

Ninguna devuelve ni registra hosts, URIs ni mensajes del servidor: quien falla solo se identifica por el tipo de error.
"""
import io
import uuid

from django.core.cache import cache
from django.db import connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import mongo

COLECCION_PRUEBA = '_verificacion_conexion'


def comprobar_postgresql():
    """SELECT 1. Devuelve vendor, versión del servidor y si la conexión va cifrada."""
    with connection.cursor() as cur:
        cur.execute('SELECT 1')
        if cur.fetchone()[0] != 1:
            raise RuntimeError('SELECT 1 no devolvió 1')
        vendor = connection.vendor
        if vendor == 'postgresql':
            cur.execute('SHOW server_version')
            version = cur.fetchone()[0]
            cur.execute('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
            fila = cur.fetchone()
            ssl = bool(fila and fila[0])
        elif vendor == 'sqlite':
            cur.execute('select sqlite_version()')
            version, ssl = cur.fetchone()[0], None
        else:
            cur.execute('SELECT VERSION()')
            version, ssl = cur.fetchone()[0], None
    return {'vendor': vendor, 'version': version, 'ssl': ssl}


def comprobar_valkey():
    """Escribe una clave con expiración corta, la lee, la compara y la borra (aunque algo falle)."""
    clave = f'verificacion:{uuid.uuid4().hex}'
    try:
        cache.set(clave, clave, timeout=10)
        if cache.get(clave) != clave:
            raise RuntimeError('el valor leído no coincide')
    finally:
        cache.delete(clave)
    return {'backend': cache.__class__.__module__.rsplit('.', 1)[0]}


def comprobar_mongodb_liviano():
    """Solo ping: es lo que usa el endpoint público (no escribe nada)."""
    mongo.ping()


def comprobar_mongodb():
    """Ping + documento en una colección temporal + archivo en GridFS: confirma permisos de lectura y escritura."""
    mongo.ping()
    col = mongo.get_db()[COLECCION_PRUEBA]
    doc_id = None
    archivo_id = None
    try:
        doc_id = col.insert_one({'verificacion': True}).inserted_id
        if col.find_one({'_id': doc_id}) is None:
            raise RuntimeError('el documento no se pudo leer')
        bucket = mongo.get_fotos_bucket()
        contenido = uuid.uuid4().bytes
        archivo_id = bucket.upload_from_stream('_verificacion_conexion.bin', io.BytesIO(contenido))
        salida = io.BytesIO()
        bucket.download_to_stream(archivo_id, salida)
        if salida.getvalue() != contenido:
            raise RuntimeError('el archivo leído no coincide')
    finally:
        if archivo_id is not None:
            mongo.get_fotos_bucket().delete(archivo_id)
        if doc_id is not None:
            col.delete_one({'_id': doc_id})


class SaludView(APIView):
    """GET /api/salud/: estado de cada servicio, sin detalles. 200 si todo responde, 503 si algo falla."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        servicios = (('postgresql', comprobar_postgresql), ('valkey', comprobar_valkey), ('mongodb', comprobar_mongodb_liviano))
        resultado = {}
        for nombre, fn in servicios:
            try:
                fn()
                resultado[nombre] = 'ok'
            except Exception:
                resultado[nombre] = 'fallo'
        todo_ok = all(v == 'ok' for v in resultado.values())
        return Response({'estado': 'ok' if todo_ok else 'fallo', **resultado},
                        status=status.HTTP_200_OK if todo_ok else status.HTTP_503_SERVICE_UNAVAILABLE)
