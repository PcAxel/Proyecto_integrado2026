"""Aprobación de Finanzas de una obra nueva: aprobarla la deja lista para delegar a terreno; rechazarla vuelve con el motivo a quien la creó.

Solo ocurre aquí (el lote genérico no puede cambiar `aprobacion_finanzas`): el cliente no puede aprobarse a sí mismo una obra.
"""
from django.db import transaction

from accounts.models import CustomUser
from notificaciones.models import Notification, notificar

from . import flujo, tablas
from .escritura import ReglaError, ahora, exigir, uid
from .models import Registro

MAX_MOTIVO = 300


def _obra_pendiente(user, obra_id):
    exigir(tablas.tiene(user, ['obras.aprobar']), 'No tiene permiso para esta operación.', 403, 'permission_denied')
    reg = Registro.objects.select_for_update().filter(tabla='obras', rid=obra_id).first()
    if reg is None:
        raise ReglaError('Obra no encontrada.', 404, 'not_found')
    exigir(flujo.aprobacion_de(reg.datos) == flujo.PENDIENTE, 'La obra no está esperando aprobación.', 409, 'estado_invalido')
    return reg


def _avisar_a_quien_la_creo(obra, obra_id, mensaje):
    creador = str(obra.get('supervisor_id') or '')
    if creador.startswith('U-') and creador[2:].isdigit():
        notificar(CustomUser.objects.filter(pk=int(creador[2:]), is_active=True), mensaje, Notification.Tipo.GENERAL)


def aprobar(user, obra_id):
    with transaction.atomic():
        reg = _obra_pendiente(user, obra_id)
        reg.datos = {**reg.datos, 'aprobacion_finanzas': flujo.APROBADA, 'aprobada_por': uid(user), 'aprobada_en': ahora(), 'motivo_rechazo_finanzas': None}
        reg.save(update_fields=['datos', 'actualizado'])
        _avisar_a_quien_la_creo(reg.datos, obra_id, f"Finanzas aprobó la obra {obra_id} ({reg.datos.get('nombre', '')}). Ya puedes delegarla a terreno.")
        return reg.fila()


def rechazar(user, obra_id, motivo):
    motivo = str(motivo or '').strip()
    exigir(motivo, 'Debe indicar el motivo del rechazo.')
    exigir(len(motivo) <= MAX_MOTIVO, 'El motivo es demasiado largo.')
    with transaction.atomic():
        reg = _obra_pendiente(user, obra_id)
        reg.datos = {**reg.datos, 'aprobacion_finanzas': flujo.RECHAZADA, 'aprobada_por': uid(user), 'aprobada_en': ahora(), 'motivo_rechazo_finanzas': motivo}
        reg.save(update_fields=['datos', 'actualizado'])
        _avisar_a_quien_la_creo(reg.datos, obra_id, f"Finanzas rechazó la obra {obra_id} ({reg.datos.get('nombre', '')}): {motivo}")
        return reg.fila()
