from rest_framework import viewsets

from accounts.models import Role
from accounts.permissions import RolePermission

from .models import Vehiculo
from .serializers import VehiculoSerializer


class VehiculoViewSet(viewsets.ModelViewSet):
    queryset = Vehiculo.objects.all()
    serializer_class = VehiculoSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.FINANZAS, Role.RRHH}, 'write': {Role.RRHH}}
