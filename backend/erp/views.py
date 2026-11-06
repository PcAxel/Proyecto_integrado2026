from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import TermsAccepted

from . import escritura, snapshot
from .reglas import ReglaError


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
