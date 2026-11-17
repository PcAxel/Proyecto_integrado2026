import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import TermsAccepted

from . import escritura, flujo, snapshot
from .reglas import ReglaError

logger = logging.getLogger(__name__)


class SnapshotView(APIView):
    """Todas las tablas que el rol puede ver, ya filtradas por el servidor."""
    permission_classes = [TermsAccepted]

    def get(self, request):
        return Response(snapshot.construir(request.user))


class LoteView(APIView):
    """Escrituras atómicas: [{op:'insert', tabla, fila} | {op:'patch', tabla, id, cambios}]. Todo o nada."""
    permission_classes = [TermsAccepted]

    def post(self, request):
        ops = request.data.get('ops')
        if not isinstance(ops, list) or not ops or len(ops) > 200:
            return Response({'detail': 'Lote inválido.', 'code': 'bad_request'}, status=400)
        try:
            filas = escritura.aplicar(request.user, request.META.get('REMOTE_ADDR'), ops)
        except ReglaError as e:
            return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)
        return Response({'filas': filas})


def _respuesta_obra(request, obra_id, cambios, accion):
    """Aplica el cambio de una obra con las mismas reglas del lote atómico (permiso, estado, cierre), lo deja en el Log de Auditoría y devuelve la obra."""
    ip = request.META.get('REMOTE_ADDR')
    try:
        previa = escritura.fila('obras', obra_id) or {}
        filas = escritura.aplicar(request.user, ip, [{'op': 'patch', 'tabla': 'obras', 'id': obra_id, 'cambios': cambios}])
    except ReglaError as e:
        return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)
    obra = filas[0]
    try:  # quién hizo qué y cuándo; si la auditoría falla, el cambio ya está hecho y no se deshace
        escritura.Lote(request.user, ip).insertar('auditoria', {
            'id': escritura.siguiente_id('auditoria'), 'entidad': 'Obra', 'entidad_id': obra_id, 'accion': accion,
            'anterior': {'etapa': flujo.etapa_de(previa), 'estado': previa.get('estado'), 'tecnicos': previa.get('tecnicos')},
            'nuevo': {'etapa': flujo.etapa_de(obra), 'estado': obra.get('estado'), 'tecnicos': obra.get('tecnicos')}})
    except Exception:
        logger.exception('obra_auditoria_error obra=%s accion=%s', obra_id, accion)
    return Response({**obra, 'etapa': flujo.etapa_de(obra)})


class DelegarObraView(APIView):
    """POST /api/erp/obras/<id>/delegar/ {tecnicos:[T-01,…]} — Jefe de Operaciones: asigna técnicos y la obra queda ASIGNADA_A_TERRENO."""
    permission_classes = [TermsAccepted]

    def post(self, request, obra_id):
        tecnicos = request.data.get('tecnicos')
        if not isinstance(tecnicos, list) or not all(isinstance(t, str) for t in tecnicos):
            return Response({'detail': 'Indica la lista de técnicos.', 'code': 'bad_request'}, status=400)
        return _respuesta_obra(request, obra_id, {'tecnicos': tecnicos, 'etapa': flujo.ASIGNADO}, 'DELEGAR_A_TERRENO')


class AuditoriaTerrenoOkView(APIView):
    """POST /api/erp/obras/<id>/auditoria-ok/ — Jefe de Operaciones: aprueba el trabajo de terreno (obra FINALIZADA) y avisa a Finanzas."""
    permission_classes = [TermsAccepted]

    def post(self, request, obra_id):
        return _respuesta_obra(request, obra_id, {'etapa': flujo.AUDITORIA_OK}, 'AUDITORIA_TERRENO_OK')
