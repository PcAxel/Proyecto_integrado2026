import hashlib

import gridfs
from bson import ObjectId
from bson.errors import InvalidId
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from pymongo.errors import PyMongoError
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import RolePermission
from obras.models import ReporteTerreno

from .mongo import ensure_indexes, get_evidencias, get_fotos_bucket
from .serializers import EvidenciaUploadSerializer

ROLES_TERRENO = {Role.OPERACIONES, Role.TECNICO}


def _public(doc):
    return {
        'id': str(doc['_id']),
        'obra_id': doc['obra_id'],
        'tecnico_id': doc['tecnico_id'],
        'descripcion': doc['descripcion'],
        'gps': doc['gps'],
        'capturada_en': doc['capturada_en'],
        'subida_en': doc['subida_en'],
        'dispositivo': doc['dispositivo'],
        'foto': {k: doc['foto'][k] for k in ('content_type', 'size', 'sha256')},
    }


class EvidenciaCreateView(APIView):
    """POST /api/evidencias/ (multipart): foto + formulario de terreno.

    La foto (GridFS) y su documento de metadatos (colección evidencias_terreno) van a MongoDB;
    en MySQL solo queda el ObjectId (string) dentro de ReporteTerreno.
    """
    permission_classes = [RolePermission]
    role_access = {'write': ROLES_TERRENO}
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        s = EvidenciaUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        foto = d['foto']
        ahora = timezone.now()

        try:
            ensure_indexes()
            file_id = get_fotos_bucket().upload_from_stream(
                f'{d["obra"]}-{ahora:%Y%m%dT%H%M%S}', foto.bytes,
                metadata={'content_type': foto.detected_content_type},
            )
            doc = {
                'obra_id': d['obra'],
                'tecnico_id': request.user.pk,
                'descripcion': d.get('descripcion', ''),
                'gps': {'latitud': d['latitud'], 'longitud': d['longitud'],
                        'precision_m': d.get('precision_gps_m')},
                'capturada_en': d.get('capturada_en', ahora),
                'subida_en': ahora,
                'dispositivo': {
                    'modelo': d.get('dispositivo_modelo', ''),
                    'so': d.get('dispositivo_so', ''),
                    'app_version': d.get('app_version', ''),
                    'user_agent': request.META.get('HTTP_USER_AGENT', '')[:300],
                    'ip': request.META.get('REMOTE_ADDR'),
                },
                'foto': {'file_id': file_id, 'content_type': foto.detected_content_type,
                         'size': len(foto.bytes), 'sha256': hashlib.sha256(foto.bytes).hexdigest()},
            }
            evidencia_id = str(get_evidencias().insert_one(doc).inserted_id)
        except PyMongoError:
            return Response({'detail': 'No se pudo guardar la evidencia. Reintenta.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            with transaction.atomic():
                reporte = ReporteTerreno.objects.create(
                    obra_id=d['obra'], tecnico=request.user,
                    descripcion=d.get('descripcion', ''), evidencia_id=evidencia_id)
        except Exception:
            # Compensación: no dejar fotos huérfanas en Mongo si falló MySQL.
            get_evidencias().delete_one({'_id': ObjectId(evidencia_id)})
            get_fotos_bucket().delete(file_id)
            raise

        return Response({'reporte_id': reporte.pk, 'evidencia_id': evidencia_id},
                        status=status.HTTP_201_CREATED)


class _EvidenciaBase(APIView):
    permission_classes = [RolePermission]
    role_access = {'read': ROLES_TERRENO}

    def get_doc(self, request, oid):
        try:
            doc = get_evidencias().find_one({'_id': ObjectId(oid)})
        except InvalidId:
            return None
        if doc and request.user.role == Role.TECNICO and doc['tecnico_id'] != request.user.pk:
            return None  # el técnico solo ve lo suyo; 404 para no revelar existencia
        return doc


class EvidenciaDetailView(_EvidenciaBase):
    def get(self, request, oid):
        doc = self.get_doc(request, oid)
        return Response(_public(doc)) if doc else Response(status=status.HTTP_404_NOT_FOUND)


class EvidenciaFotoView(_EvidenciaBase):
    def get(self, request, oid):
        doc = self.get_doc(request, oid)
        if not doc:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            data = get_fotos_bucket().open_download_stream(doc['foto']['file_id']).read()
        except gridfs.NoFile:
            return Response(status=status.HTTP_404_NOT_FOUND)
        resp = HttpResponse(data, content_type=doc['foto']['content_type'])
        resp['Cache-Control'] = 'private, max-age=3600'
        resp['X-Content-Type-Options'] = 'nosniff'
        return resp
