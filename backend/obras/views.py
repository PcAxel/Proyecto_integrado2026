from rest_framework import mixins, viewsets

from accounts.models import Role
from accounts.permissions import RolePermission

from .models import Obra, ReporteTerreno
from .serializers import ObraSerializer, ReporteTerrenoSerializer


class ObraViewSet(viewsets.ModelViewSet):
    queryset = Obra.objects.all()
    serializer_class = ObraSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.FINANZAS, Role.OPERACIONES, Role.TECNICO}, 'write': {Role.OPERACIONES}}


class ReporteTerrenoViewSet(mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Los reportes se crean al subir evidencia (POST /api/evidencias/). Aquí solo se consultan."""
    serializer_class = ReporteTerrenoSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.OPERACIONES, Role.TECNICO}}

    def get_queryset(self):
        qs = ReporteTerreno.objects.all()
        if self.request.user.role == Role.TECNICO:
            qs = qs.filter(tecnico=self.request.user)  # el técnico solo ve lo suyo
        obra = self.request.query_params.get('obra')
        return qs.filter(obra_id=obra) if obra else qs
