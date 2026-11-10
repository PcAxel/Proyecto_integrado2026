from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import RolePermission

from . import servicio
from .models import LecturaOdometro, Vehiculo
from .serializers import DocumentoVehiculoSerializer, LecturaOdometroSerializer, VehiculoSerializer
from .servicio import FlotaError


class VehiculoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Flota. Leen Finanzas y RR. HH. (y el Administrador); crea y edita RR. HH. (y el Administrador). Los vehículos no se eliminan: se
    desactivan o se mandan a taller. Los vencimientos y el kilometraje se registran como historial en `documentos/` y `lecturas/`."""
    serializer_class = VehiculoSerializer
    permission_classes = [RolePermission]
    role_access = {'read': {Role.FINANZAS, Role.RRHH}, 'write': {Role.RRHH}}
    http_method_names = ['get', 'post', 'patch', 'head', 'options']  # sin PUT ni DELETE

    def get_queryset(self):
        return Vehiculo.objects.select_related('tecnico').prefetch_related('documentos')

    @action(detail=True, methods=['get', 'post'], url_path='documentos')
    def documentos(self, request, pk=None):
        v = self.get_object()
        if request.method == 'GET':
            return Response(DocumentoVehiculoSerializer(v.documentos.select_related('registrado_por'), many=True).data)
        s = DocumentoVehiculoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        servicio.registrar_documento(v, usuario=request.user, **{k: s.validated_data.get(k) for k in ('tipo', 'fecha_vencimiento', 'fecha_realizacion')},
                                     referencia=s.validated_data.get('referencia', ''), observacion=s.validated_data.get('observacion', ''))
        return Response(VehiculoSerializer(self.get_queryset().get(pk=v.pk), context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='lecturas')
    def lecturas(self, request, pk=None):
        v = self.get_object()
        if request.method == 'GET':
            return Response(LecturaOdometroSerializer(v.lecturas.select_related('registrado_por')[:200], many=True).data)
        s = LecturaOdometroSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            servicio.registrar_km(v, s.validated_data['km'], LecturaOdometro.Origen.MANUAL, request.user)
        except FlotaError as e:
            return Response({'km': [str(e)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(VehiculoSerializer(self.get_queryset().get(pk=v.pk), context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)
