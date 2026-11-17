from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import TermsAccepted

from .models import Notification

MAX_LISTA = 20
MAX_IDS = 100


def _fila(n):
    return {'id': n.id, 'mensaje': n.mensaje, 'tipo': n.tipo, 'leida': n.leida, 'fecha_creacion': n.fecha_creacion.isoformat()}


def _propias(request):
    return Notification.objects.filter(usuario_destino=request.user)


class NotificacionesView(APIView):
    """Los últimos avisos de quien consulta (primero las no leídas) y cuántas no ha leído. Nunca ve las de otra persona."""
    permission_classes = [TermsAccepted]

    def get(self, request):
        propias = _propias(request)
        solo_no_leidas = request.query_params.get('solo_no_leidas') in ('1', 'true')
        lista = propias.filter(leida=False) if solo_no_leidas else propias
        # no leídas primero y luego las más recientes
        filas = list(lista.order_by('leida', '-fecha_creacion', '-id')[:MAX_LISTA])
        return Response({'no_leidas': propias.filter(leida=False).count(), 'resultados': [_fila(n) for n in filas]})


class MarcarLeidasView(APIView):
    """Marca como leídas las indicadas (`ids`) o, sin `ids`, todas las propias."""
    permission_classes = [TermsAccepted]

    def post(self, request):
        ids = request.data.get('ids')
        qs = _propias(request).filter(leida=False)
        if ids is not None:
            if not isinstance(ids, list) or len(ids) > MAX_IDS or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
                return Response({'detail': 'Lista de avisos inválida.', 'code': 'bad_request'}, status=400)
            qs = qs.filter(id__in=ids)
        marcadas = qs.update(leida=True)
        return Response({'marcadas': marcadas, 'no_leidas': _propias(request).filter(leida=False).count()})
