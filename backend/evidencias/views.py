from django.db import transaction
from django.http import HttpResponse
from pymongo.errors import PyMongoError
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import RolePermission
from obras.models import ReporteTerreno

from .mongo import crear, ensure_indexes, eliminar, leer_foto, obtener
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

        try:
            ensure_indexes()
            doc = crear(
                obra_id=d['obra'], tecnico_id=request.user.pk, foto_bytes=foto.bytes, content_type=foto.detected_content_type,
                descripcion=d.get('descripcion', ''), capturada_en=d.get('capturada_en'),
                gps={'latitud': d['latitud'], 'longitud': d['longitud'], 'precision_m': d.get('precision_gps_m')},
                dispositivo={
                    'modelo': d.get('dispositivo_modelo', ''),
                    'so': d.get('dispositivo_so', ''),
                    'app_version': d.get('app_version', ''),
                    'user_agent': request.META.get('HTTP_USER_AGENT', '')[:300],
                    'ip': request.META.get('REMOTE_ADDR'),
                })
            evidencia_id = str(doc['_id'])
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
            eliminar(evidencia_id)
            raise

        return Response({'reporte_id': reporte.pk, 'evidencia_id': evidencia_id},
                        status=status.HTTP_201_CREATED)


class _EvidenciaBase(APIView):
    permission_classes = [RolePermission]
    role_access = {'read': ROLES_TERRENO}

    def get_doc(self, request, oid):
        doc = obtener(oid)
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
        data = leer_foto(doc)
        if data is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        resp = HttpResponse(data, content_type=doc['foto']['content_type'])
        resp['Cache-Control'] = 'private, max-age=3600'
        resp['X-Content-Type-Options'] = 'nosniff'
        return resp
