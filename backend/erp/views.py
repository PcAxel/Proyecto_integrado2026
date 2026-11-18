import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import TermsAccepted

from . import aprobacion_obras, compras, escritura, flujo, snapshot
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


def _resolver_solicitud(request, solicitud_id, accion, entidad_accion, **kwargs):
    ip = request.META.get('REMOTE_ADDR')
    try:
        resultado = accion(request.user, solicitud_id, **kwargs)
    except ReglaError as e:
        return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)
    solicitud, ordenes = resultado if isinstance(resultado, tuple) else (resultado, [])
    try:
        escritura.Lote(request.user, ip).insertar('auditoria', {
            'id': escritura.siguiente_id('auditoria'), 'entidad': 'SolicitudCompra', 'entidad_id': solicitud_id, 'accion': entidad_accion,
            'anterior': {'estado': 'PENDIENTE'}, 'nuevo': {'estado': solicitud['estado'], 'ordenes': ordenes, 'motivo_rechazo': solicitud.get('motivo_rechazo')}})
    except Exception:
        logger.exception('compra_auditoria_error solicitud=%s', solicitud_id)
    return Response({'solicitud': solicitud, 'ordenes': ordenes})


class EmitirOrdenesView(APIView):
    """POST /api/erp/solicitudes-compra/<id>/emitir/ — Finanzas aprueba la solicitud de Bodega y se emiten las órdenes de compra por proveedor."""
    permission_classes = [TermsAccepted]

    def post(self, request, solicitud_id):
        return _resolver_solicitud(request, solicitud_id, compras.emitir_ordenes, 'APROBAR_SOLICITUD_COMPRA')


class RechazarSolicitudView(APIView):
    """POST /api/erp/solicitudes-compra/<id>/rechazar/ {motivo} — Finanzas rechaza la solicitud (el motivo le llega a Bodega)."""
    permission_classes = [TermsAccepted]

    def post(self, request, solicitud_id):
        return _resolver_solicitud(request, solicitud_id, compras.rechazar, 'RECHAZAR_SOLICITUD_COMPRA', motivo=request.data.get('motivo'))


def _resolver_obra(request, obra_id, funcion, accion, **kwargs):
    ip = request.META.get('REMOTE_ADDR')
    try:
        obra = funcion(request.user, obra_id, **kwargs)
    except ReglaError as e:
        return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)
    try:  # quién la resolvió y cuándo; si la auditoría falla, la decisión ya está tomada y no se deshace
        escritura.Lote(request.user, ip).insertar('auditoria', {
            'id': escritura.siguiente_id('auditoria'), 'entidad': 'Obra', 'entidad_id': obra_id, 'accion': accion,
            'anterior': {'aprobacion_finanzas': flujo.PENDIENTE}, 'nuevo': {'aprobacion_finanzas': obra['aprobacion_finanzas'], 'motivo': obra.get('motivo_rechazo_finanzas')}})
    except Exception:
        logger.exception('obra_aprobacion_auditoria_error obra=%s', obra_id)
    return Response(obra)


class AprobarObraView(APIView):
    """POST /api/erp/obras/<id>/aprobar/ — Finanzas aprueba una obra nueva: Operaciones ya puede delegarla a terreno."""
    permission_classes = [TermsAccepted]

    def post(self, request, obra_id):
        return _resolver_obra(request, obra_id, aprobacion_obras.aprobar, 'APROBAR_OBRA')


class RechazarObraView(APIView):
    """POST /api/erp/obras/<id>/rechazar/ {motivo} — Finanzas rechaza la obra; el motivo le llega a quien la creó."""
    permission_classes = [TermsAccepted]

    def post(self, request, obra_id):
        return _resolver_obra(request, obra_id, aprobacion_obras.rechazar, 'RECHAZAR_OBRA', motivo=request.data.get('motivo'))


class InformeEjecutivoPptxView(APIView):
    """Informe ejecutivo en PowerPoint, compilado al vuelo con las cifras calculadas por el servidor (ORM). Lo puede descargar quien ya puede leer
    compras, bodega, presupuestos y obras (Administrador, Finanzas y Auditoría)."""
    permission_classes = [TermsAccepted]

    def get(self, request):
        from django.http import HttpResponse
        from rest_framework.exceptions import PermissionDenied
        from . import informe_pptx, informes, tablas
        if not all(tablas.puede_leer(request.user, t) for t in ('facturas', 'cardex', 'presupuestos', 'obras')):
            raise PermissionDenied('Tu rol no puede descargar el informe ejecutivo.')
        persona = request.user.full_name or request.user.email
        contenido = informe_pptx.generar_pptx(informes.informe_ejecutivo(), generado_por=persona)
        respuesta = HttpResponse(contenido, content_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
        respuesta['Content-Disposition'] = 'attachment; filename="informe-ejecutivo-fyag.pptx"'
        respuesta['Cache-Control'] = 'no-store'
        return respuesta
