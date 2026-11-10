from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import CustomUser, Role
from accounts.permissions import RolePermission

from . import reglas
from .models import MarcaAsistencia
from .serializers import MarcaSerializer


def _marcas_del_dia(usuario, dia):
    # Rango explícito del día local: `fecha__date` exige tablas de zona horaria cargadas en MySQL.
    inicio = timezone.make_aware(datetime.combine(dia, time.min))
    marcas = list(MarcaAsistencia.objects.filter(usuario=usuario, fecha__gte=inicio, fecha__lt=inicio + timedelta(days=1)))
    for m in marcas:
        m.fecha_local = timezone.localtime(m.fecha)
    return marcas


class MiDiaView(APIView):
    """Marcas de hoy del técnico autenticado."""
    permission_classes = [RolePermission]
    role_access = {'read': {Role.TECNICO}}

    def get(self, request):
        marcas = _marcas_del_dia(request.user, timezone.localdate())
        return Response({'tecnico_id': request.user.pk, 'marcas': [MarcaSerializer(m).data for m in marcas]})


class MarcarView(APIView):
    """Registra una entrada o salida. Idempotente por `client_id`: un reintento no duplica la marca."""
    permission_classes = [RolePermission]
    role_access = {'write': {Role.TECNICO}}

    @transaction.atomic
    def post(self, request):
        usuario = request.user
        client_id = request.data.get('client_id')
        if client_id:
            previa = MarcaAsistencia.objects.filter(usuario=usuario, client_id=client_id).first()
            if previa:
                return Response(MarcaSerializer(previa).data)

        s = MarcaSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        fecha = s.validated_data.get('fecha') or timezone.now()
        dia = timezone.localtime(fecha).date()
        # Bloqueo de la cuenta para que dos marcas simultáneas no rompan la secuencia entrada/salida.
        type(usuario).objects.select_for_update().get(pk=usuario.pk)
        error = reglas.validar_marca(s.validated_data['tipo'], _marcas_del_dia(usuario, dia))
        if error:
            return Response({'detail': error}, status=status.HTTP_409_CONFLICT)
        marca = s.save(usuario=usuario, fecha=fecha)
        return Response(MarcaSerializer(marca).data, status=status.HTTP_201_CREATED)


ORDEN = {'AUSENTE': 0, 'PENDIENTE': 1, 'EN_JORNADA': 2, 'FINALIZADA': 3}


class AsistenciaHoyView(APIView):
    """Asistencia de hoy de todos los técnicos activos (RRHH)."""
    permission_classes = [RolePermission]
    role_access = {'read': {Role.RRHH}}

    def get(self, request):
        ahora = timezone.localtime()
        filas = []
        for t in CustomUser.objects.filter(role=Role.TECNICO, is_active=True).order_by('first_name', 'last_name', 'email'):
            marcas = _marcas_del_dia(t, ahora.date())
            entrada = next((m for m in marcas if m.tipo == reglas.ENTRADA), None)
            salida = next((m for m in reversed(marcas) if m.tipo == reglas.SALIDA), None)
            estado = reglas.estado_del_dia(marcas, ahora.time())
            filas.append({
                'tecnico_id': t.pk, 'nombre': t.full_name or t.email, 'cargo': t.get_role_display(), 'estado': estado,
                'entrada': entrada.fecha_local.isoformat() if entrada else None,
                'salida': salida.fecha_local.isoformat() if salida and estado == 'FINALIZADA' else None,
                'horas': reglas.horas_trabajadas(marcas, ahora.time()) if marcas else 0,
                'atrasado': bool(entrada and reglas.llego_tarde(entrada.fecha_local.time())),
                'geocerca': None, 'fuera_geocerca': False,
            })
        filas.sort(key=lambda f: (ORDEN[f['estado']], f['nombre']))
        return Response(filas)
