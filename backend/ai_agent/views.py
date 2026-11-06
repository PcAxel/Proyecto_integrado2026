from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role

from .permissions import SoloRoles
from .prompts import ROLES_CON_CHAT
from .serializers import ChatEntradaSerializer, FacturaEntradaSerializer, ReporteEntradaSerializer
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
    """POST /api/ai/chat/ — todos los roles. Conversación abierta con el perfil del rol; el historial lo envía el cliente."""
    roles_permitidos = ROLES_CON_CHAT
    serializer_class = ChatEntradaSerializer

    def ejecutar(self, user, rol, datos):
        return {'respuesta': conversar(user, rol, datos['mensajes'])}
