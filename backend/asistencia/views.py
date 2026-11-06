from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import RolePermission
from personal.models import Trabajador

from . import reglas
from .models import MarcaAsistencia
from .serializers import MarcaSerializer


def _ficha(user):
    return Trabajador.objects.filter(usuario=user, activo=True).first()


def _marcas_del_dia(trabajador, dia):
    # Rango explícito del día local: `fecha__date` exige tablas de zona horaria cargadas en MySQL.
    inicio = timezone.make_aware(datetime.combine(dia, time.min))
    marcas = list(MarcaAsistencia.objects.filter(trabajador=trabajador, fecha__gte=inicio, fecha__lt=inicio + timedelta(days=1)))
    for m in marcas:
        m.fecha_local = timezone.localtime(m.fecha)
    return marcas


class MiDiaView(APIView):
    """Marcas de hoy del técnico autenticado."""
    permission_classes = [RolePermission]
    role_access = {'read': {Role.TECNICO}}

    def get(self, request):
        ficha = _ficha(request.user)
        if not ficha:
            return Response({'detail': 'El usuario no tiene ficha de personal.'}, status=status.HTTP_403_FORBIDDEN)
        marcas = _marcas_del_dia(ficha, timezone.localdate())
        return Response({'tecnico_id': ficha.pk, 'marcas': [MarcaSerializer(m).data for m in marcas]})


class MarcarView(APIView):
    """Registra una entrada o salida. Idempotente por `client_id`: un reintento no duplica la marca."""
    permission_classes = [RolePermission]
    role_access = {'write': {Role.TECNICO}}

    @transaction.atomic
    def post(self, request):
        ficha = _ficha(request.user)
        if not ficha:
            return Response({'detail': 'El usuario no tiene ficha de personal.'}, status=status.HTTP_403_FORBIDDEN)
        client_id = request.data.get('client_id')
        if client_id:
            previa = MarcaAsistencia.objects.filter(trabajador=ficha, client_id=client_id).first()
            if previa:
                return Response(MarcaSerializer(previa).data)

        s = MarcaSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        fecha = s.validated_data.get('fecha') or timezone.now()
        dia = timezone.localtime(fecha).date()
        # Bloqueo de la ficha para que dos marcas simultáneas no rompan la secuencia entrada/salida.
        Trabajador.objects.select_for_update().get(pk=ficha.pk)
        error = reglas.validar_marca(s.validated_data['tipo'], _marcas_del_dia(ficha, dia))
        if error:
            return Response({'detail': error}, status=status.HTTP_409_CONFLICT)
        marca = s.save(trabajador=ficha, fecha=fecha)
        return Response(MarcaSerializer(marca).data, status=status.HTTP_201_CREATED)


ORDEN = {'AUSENTE': 0, 'PENDIENTE': 1, 'EN_JORNADA': 2, 'FINALIZADA': 3}


class AsistenciaHoyView(APIView):
    """Asistencia de hoy de todos los técnicos activos (RRHH)."""
    permission_classes = [RolePermission]
    role_access = {'read': {Role.RRHH}}

    def get(self, request):
        ahora = timezone.localtime()
        filas = []
        for t in Trabajador.objects.filter(activo=True):
            marcas = _marcas_del_dia(t, ahora.date())
            entrada = next((m for m in marcas if m.tipo == reglas.ENTRADA), None)
            salida = next((m for m in reversed(marcas) if m.tipo == reglas.SALIDA), None)
            estado = reglas.estado_del_dia(marcas, ahora.time())
            filas.append({
                'tecnico_id': t.pk, 'nombre': f'{t.nombres} {t.apellidos}', 'cargo': t.cargo, 'estado': estado,
                'entrada': entrada.fecha_local.isoformat() if entrada else None,
                'salida': salida.fecha_local.isoformat() if salida and estado == 'FINALIZADA' else None,
                'horas': reglas.horas_trabajadas(marcas, ahora.time()) if marcas else 0,
                'atrasado': bool(entrada and reglas.llego_tarde(entrada.fecha_local.time())),
                'geocerca': None, 'fuera_geocerca': False,
            })
        filas.sort(key=lambda f: (ORDEN[f['estado']], f['nombre']))
        return Response(filas)
