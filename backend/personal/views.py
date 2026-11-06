from rest_framework import viewsets

from accounts.models import Role
from accounts.permissions import RolePermission

from .models import Trabajador
from .serializers import TrabajadorSerializer


class TrabajadorViewSet(viewsets.ModelViewSet):
    # Incluye tarifas y datos personales: leen Finanzas y RRHH; solo RRHH (y Admin) modifica.
    queryset = Trabajador.objects.all()
    serializer_class = TrabajadorSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.FINANZAS, Role.RRHH}, 'write': {Role.RRHH}}
