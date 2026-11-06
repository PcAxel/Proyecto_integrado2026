from rest_framework import viewsets

from accounts.models import Role
from accounts.permissions import RolePermission

from .models import Presupuesto
from .serializers import PresupuestoSerializer


class PresupuestoViewSet(viewsets.ModelViewSet):
    queryset = Presupuesto.objects.prefetch_related('items')
    serializer_class = PresupuestoSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.FINANZAS, Role.OPERACIONES}, 'write': {Role.FINANZAS}}
