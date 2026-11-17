import time
from datetime import date, datetime, timedelta

from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role

from . import gobernanza
from .models import AIPoliticaRol, AIPromptAuditLog
from .permissions import PuedeGestionarGobernanzaIA, PuedeVerGobernanzaIA, SoloRoles
from .prompts import ROLES_CON_CHAT
from .serializers import ChatEntradaSerializer, FacturaEntradaSerializer, ReporteEntradaSerializer
from .reportes import generadores
from .services import ServicioIAError, conversar, extraer_factura, redactar_reporte
from .throttles import IADiarioThrottle, IARafagaThrottle


class _AgenteView(APIView):
    permission_classes = [SoloRoles]
    throttle_classes = [IARafagaThrottle, IADiarioThrottle]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    roles_permitidos = frozenset()

    def post(self, request):
        s = self.serializer_class(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            # El rol sale SIEMPRE del usuario autenticado (request.user.role), nunca del cuerpo de la petición.
            return Response(self.ejecutar(request.user, request.user.role, s.validated_data))
        except ServicioIAError as e:
            return Response({'detail': e.mensaje, 'code': e.code}, status=e.status)


class ExtraerFacturaView(_AgenteView):
    """POST /api/ai/extract-invoice/ — Admin y Finanzas. Devuelve los datos de la factura listos para autocompletar el formulario."""
    roles_permitidos = frozenset({Role.ADMIN, Role.FINANZAS})
    serializer_class = FacturaEntradaSerializer

    def ejecutar(self, user, rol, datos):
        return extraer_factura(user, rol, datos.get('texto', ''), datos.get('imagen'))


class RedactarReporteView(_AgenteView):
    """POST /api/ai/draft-report/ — Operaciones y Técnicos. Convierte notas sueltas en un párrafo técnico."""
    roles_permitidos = frozenset({Role.OPERACIONES, Role.TECNICO})
    serializer_class = ReporteEntradaSerializer

    def ejecutar(self, user, rol, datos):
        return redactar_reporte(user, rol, datos['notas'])


class ChatView(_AgenteView):
    """POST /api/ai/chat/ — todos los roles. Agente de conversación, navegación y búsqueda de SOLO LECTURA; el historial lo envía el cliente."""
    roles_permitidos = ROLES_CON_CHAT
    serializer_class = ChatEntradaSerializer

    # Sin clave de IA en el servidor responde el motor local del sistema. Los demás fallos del proveedor (clave rechazada, caída, tiempo agotado)
    # siguen devolviendo su error de siempre: así no cambia el contrato que ya tenían los clientes.
    RESPALDO_LOCAL = ('ai_not_configured',)

    def ejecutar(self, user, rol, datos):
        """Cada turno pasa por la gobernanza: política del rol → ámbito → aclaración → agente (IA o motor local) → acciones de interfaz
        autorizadas → bitácora. La respuesta conserva los campos de siempre y agrega `ui_actions`, `opciones`, `estado_seguridad` y `motor`."""
        inicio = time.monotonic()
        rutas, origen = datos.get('rutas', []), datos.get('origen', '')
        prompt = datos['mensajes'][-1]['content']
        politica = gobernanza.politica_de(rol)
        base = {'respuesta_texto': '', 'accion': 'ninguna', 'ruta': None, 'termino_busqueda': None}

        def cerrar(salida, estado=Estado.PERMITIDO, riesgo=Riesgo.BAJO, motivo='', motor='politica', acciones=()):
            gobernanza.registrar(user, prompt=prompt, respuesta=salida['respuesta_texto'], origen=origen, acciones=acciones, estado=estado, riesgo=riesgo,
                                 motivo=motivo, motor=motor, latencia_ms=(time.monotonic() - inicio) * 1000)
            salida.pop('estado', None)
            return {'respuesta': salida['respuesta_texto'], **salida, 'ui_actions': list(acciones), 'opciones': salida.get('opciones', []),
                    'estado_seguridad': estado, 'motor': motor}

        if not politica['agente_activo']:
            return cerrar({**base, 'respuesta_texto': 'El área de TI desactivó el asistente para tu perfil. Si lo necesitas para tu trabajo, solicítalo a TI.'},
                          Estado.BLOQUEADO_POR_ROL, Riesgo.BAJO, 'Agente desactivado para el rol por política de TI')
        if (b := gobernanza.evaluar_ambito(user, prompt)):
            return cerrar({**base, 'respuesta_texto': b['respuesta']}, Estado.BLOQUEADO_POR_ROL, b['riesgo'], b['motivo'])
        if (a := gobernanza.aclaracion_para(user, prompt, rutas)):
            return cerrar({**base, 'respuesta_texto': a['pregunta'], 'opciones': a['opciones']}, Estado.REQUIERE_ACLARACION, Riesgo.BAJO, 'Orden incompleta')

        motor = 'ia'
        try:
            if not gobernanza.ia_configurada():
                raise ServicioIAError('IA no configurada', 503, 'ai_not_configured')
            r = conversar(user, rol, datos['mensajes'], rutas, prompt_extra=gobernanza.prompt_de_gobernanza(user, rutas, politica),
                          con_herramientas=politica['permite_reportes'])
        except ServicioIAError as e:
            if e.code not in self.RESPALDO_LOCAL:
                gobernanza.registrar(user, prompt=prompt, respuesta=f'[sin respuesta: {e.code}]', origen=origen, motor='ia', latencia_ms=(time.monotonic() - inicio) * 1000)
                raise
            motor, r = 'local', gobernanza.responder_local(user, prompt, rutas, origen)

        estado, riesgo, motivo = Estado.PERMITIDO, Riesgo.BAJO, ''
        if r.get('estado') == 'aclaracion':
            estado, motivo = Estado.REQUIERE_ACLARACION, 'El agente pidió precisar la orden'
        elif r.get('estado') == 'fuera_de_ambito':
            estado, riesgo, motivo = Estado.BLOQUEADO_POR_ROL, Riesgo.MEDIO, 'El agente rechazó la consulta por estar fuera del ámbito del rol'
        if gobernanza.riesgo_de_manipulacion(prompt):
            riesgo, motivo = Riesgo.ALTO, (motivo + ' · ' if motivo else '') + 'Posible intento de manipular las instrucciones del agente'
        # Una consulta rechazada o que aún se está aclarando no mueve la interfaz.
        acciones = gobernanza.construir_acciones(user, r, rutas, politica) if estado == Estado.PERMITIDO else gobernanza.construir_acciones(user, {**base}, rutas, politica)
        if estado != Estado.PERMITIDO:
            r.update(accion='ninguna', ruta=None, termino_busqueda=None)
            r.pop('resaltar', None), r.pop('rellenar', None)
        return cerrar(r, estado, riesgo, motivo, motor, acciones)


class DescargarReporteView(APIView):
    """GET /api/ai/reportes/<token>/?formato=xlsx|docx|pptx — descarga un reporte que el agente generó PARA ESTE USUARIO.
    El archivo se busca en la carpeta privada del usuario autenticado: el token de otra persona no sirve (404, sin distinguir si existe)."""
    permission_classes = [SoloRoles]
    roles_permitidos = ROLES_CON_CHAT

    def get(self, request, token):
        formato = request.query_params.get('formato', '')
        ruta = generadores.ruta_de(request.user, token, formato)
        if ruta is None:
            raise Http404
        respuesta = FileResponse(open(ruta, 'rb'), as_attachment=True, filename=f'reporte_fyag_{date.today():%Y%m%d}.{formato}', content_type=generadores.FORMATOS[formato])
        respuesta['Cache-Control'] = 'private, no-store'
        respuesta['X-Content-Type-Options'] = 'nosniff'
        return respuesta


Estado, Riesgo = AIPromptAuditLog.Estado, AIPromptAuditLog.Riesgo


# ───────────────────────── Gobernanza IA (módulo de TI) ─────────────────────────
def _fila_bitacora(x):
    return {'id': x.pk, 'timestamp': x.timestamp.isoformat(), 'usuario_id': x.usuario_id, 'usuario': x.usuario.full_name or x.usuario.email, 'email': x.usuario.email,
            'rol_activo': x.rol_activo, 'rol_texto': x.get_rol_activo_display(), 'modulo_origen': x.modulo_origen, 'prompt_enviado': x.prompt_enviado,
            'respuesta_ia': x.respuesta_ia, 'acciones_ui_ejecutadas': x.acciones_ui_ejecutadas, 'tokens_estimados': x.tokens_estimados, 'latencia_ms': x.latencia_ms,
            'estado_seguridad': x.estado_seguridad, 'nivel_riesgo': x.nivel_riesgo, 'motivo': x.motivo, 'motor': x.motor}


class BitacoraPromptsView(APIView):
    """GET /api/ai/gobernanza/bitacora/?usuario=&rol=&estado=&riesgo=&desde=&hasta=&alertas=1 — trazabilidad de prompts (solo lectura; la bitácora no se edita).
    Devuelve las filas más recientes (hasta 300) y un resumen para los indicadores del panel."""
    permission_classes = [PuedeVerGobernanzaIA]

    def get(self, request):
        q = request.query_params
        qs = AIPromptAuditLog.objects.select_related('usuario')
        if (u := q.get('usuario', '').strip()):
            qs = qs.filter(usuario_id=int(u)) if u.isdigit() else qs.filter(usuario__email__icontains=u)
        if q.get('rol') in Role.values:
            qs = qs.filter(rol_activo=q['rol'])
        if q.get('estado') in Estado.values:
            qs = qs.filter(estado_seguridad=q['estado'])
        if q.get('riesgo') in Riesgo.values:
            qs = qs.filter(nivel_riesgo=q['riesgo'])
        if q.get('alertas') == '1':
            qs = qs.exclude(estado_seguridad=Estado.PERMITIDO, nivel_riesgo=Riesgo.BAJO)
        try:
            if q.get('desde'):
                qs = qs.filter(timestamp__date__gte=date.fromisoformat(q['desde']))
            if q.get('hasta'):
                qs = qs.filter(timestamp__date__lte=date.fromisoformat(q['hasta']))
        except ValueError:
            return Response({'detail': 'Las fechas van como AAAA-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        todo = AIPromptAuditLog.objects
        ayer = datetime.now().astimezone() - timedelta(hours=24)
        resumen = {
            'total': todo.count(), 'ultimas_24h': todo.filter(timestamp__gte=ayer).count(),
            'bloqueados': todo.filter(estado_seguridad=Estado.BLOQUEADO_POR_ROL).count(),
            'riesgo_alto': todo.filter(nivel_riesgo=Riesgo.ALTO).count(),
            'aclaraciones': todo.filter(estado_seguridad=Estado.REQUIERE_ACLARACION).count(),
            'tokens_estimados': sum(todo.values_list('tokens_estimados', flat=True)),
        }
        return Response({'resumen': resumen, 'filas': [_fila_bitacora(x) for x in qs[:300]], 'coincidencias': qs.count()})


class PoliticasIAView(APIView):
    """GET /api/ai/gobernanza/politicas/ — derechos y deberes del agente por rol y los temas que cada rol puede tratar (según la matriz de permisos).
    PATCH /api/ai/gobernanza/politicas/<ROL>/ — cambia los interruptores de un rol (solo TI)."""

    def get_permissions(self):
        return [PuedeVerGobernanzaIA()] if self.request.method == 'GET' else [PuedeGestionarGobernanzaIA()]

    @staticmethod
    def _rol(rol):
        from types import SimpleNamespace
        ficticio = SimpleNamespace(role=rol)
        permitidos, vedados = gobernanza.temas_del_rol(ficticio)
        return {'rol': rol, 'rol_texto': Role(rol).label, **gobernanza.politica_de(rol),
                'temas_permitidos': [gobernanza.TEMAS[k][0] for k in permitidos], 'temas_vedados': [gobernanza.TEMAS[k][0] for k in vedados]}

    def get(self, request):
        return Response([self._rol(r) for r in Role.values if r in ROLES_CON_CHAT])

    def patch(self, request, rol=None):
        if rol not in ROLES_CON_CHAT:
            raise Http404
        cambios = {}
        for campo in gobernanza.CAMPOS_POLITICA:
            if campo not in request.data:
                continue
            v = request.data[campo]
            if campo == 'max_acciones':
                if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 8:
                    return Response({'max_acciones': ['Indica un número de 0 a 8.']}, status=status.HTTP_400_BAD_REQUEST)
            elif not isinstance(v, bool):
                return Response({campo: ['Debe ser verdadero o falso.']}, status=status.HTTP_400_BAD_REQUEST)
            cambios[campo] = v
        AIPoliticaRol.objects.update_or_create(rol=rol, defaults={**cambios, 'actualizado_por': request.user})
        return Response(self._rol(rol))
