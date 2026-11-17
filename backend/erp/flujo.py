"""Flujo de una obra entre áreas: Operaciones la delega a terreno y da la auditoría; Finanzas la factura.

`etapa` es el hilo del flujo; `estado` (PLANIFICADA / EN_CURSO / FINALIZADA) sigue siendo el ciclo operativo que usan la app de
terreno, el Cardex y la facturación. Las obras anteriores al flujo no tienen `etapa` guardada: se deduce de su estado.
"""
CREADO, ASIGNADO, EN_EJECUCION, AUDITORIA_OK, FACTURADO = ('CREADO', 'ASIGNADO_A_TERRENO', 'EN_EJECUCION', 'AUDITORIA_TERRENO_OK', 'FACTURADO')
ETAPAS = (CREADO, ASIGNADO, EN_EJECUCION, AUDITORIA_OK, FACTURADO)
_POR_ESTADO = {'PLANIFICADA': CREADO, 'EN_CURSO': EN_EJECUCION, 'FINALIZADA': AUDITORIA_OK}


def etapa_de(obra):
    """Etapa guardada o, si la obra es anterior al flujo, la que corresponde a su estado."""
    guardada = obra.get('etapa')
    return guardada if guardada in ETAPAS else _POR_ESTADO.get(obra.get('estado'), CREADO)


def avisar_a_finanzas(obra):
    """Aviso a todo el equipo de Finanzas: la obra pasó la auditoría de terreno y ya se puede facturar."""
    from accounts.models import CustomUser, Role
    from notificaciones.models import Notification, notificar
    destino = CustomUser.objects.filter(role=Role.FINANZAS, is_active=True)
    nombre = obra.get('nombre') or obra['id']
    return notificar(destino, f"Auditoría de Terreno completada para la Obra {nombre} ({obra['id']}). Lista para facturar.", Notification.Tipo.FACTURACION_LISTA)
