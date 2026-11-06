from rest_framework import mixins, viewsets

from accounts.models import Role
from accounts.permissions import RolePermission

from .models import Articulo, MovimientoCardex
from .serializers import ArticuloSerializer, MovimientoSerializer

ACCESO_BODEGA = {'read': {Role.FINANZAS, Role.OPERACIONES}, 'write': {Role.OPERACIONES}}


class ArticuloViewSet(viewsets.ModelViewSet):
    queryset = Articulo.objects.all()
    serializer_class = ArticuloSerializer
    permission_classes = [RolePermission]
    role_access = ACCESO_BODEGA


class CardexViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    viewsets.GenericViewSet):
    """Sin update ni delete: el Cardex es un libro inmutable."""
    serializer_class = MovimientoSerializer
    permission_classes = [RolePermission]
    role_access = ACCESO_BODEGA

    def get_queryset(self):
        qs = MovimientoCardex.objects.select_related('articulo', 'obra', 'usuario')
        articulo = self.request.query_params.get('articulo')
        return qs.filter(articulo_id=articulo) if articulo else qs
