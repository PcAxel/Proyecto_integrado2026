"""Flujo de una obra entre áreas: Operaciones la delega a terreno y da la auditoría; Finanzas la factura.

`etapa` es el hilo del flujo; `estado` (PLANIFICADA / EN_CURSO / FINALIZADA) sigue siendo el ciclo operativo que usan la app de
terreno, el Cardex y la facturación. Las obras anteriores al flujo no tienen `etapa` guardada: se deduce de su estado.
"""
CREADO, ASIGNADO, EN_EJECUCION, AUDITORIA_OK, FACTURADO, PAGADA = ('CREADO', 'ASIGNADO_A_TERRENO', 'EN_EJECUCION', 'AUDITORIA_TERRENO_OK', 'FACTURADO', 'PAGADA')
ETAPAS = (CREADO, ASIGNADO, EN_EJECUCION, AUDITORIA_OK, FACTURADO, PAGADA)
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


# Aprobación de Finanzas: una obra nueva nace PENDIENTE y Operaciones no puede delegarla a terreno hasta que Finanzas la APRUEBE.
# Las de emergencia o garantía (CU30) nacen EXENTA: son urgentes y ya tienen su propio camino (regularizar con un presupuesto aprobado).
# Las obras anteriores a esta regla no traen el campo y se consideran APROBADA.
PENDIENTE, APROBADA, RECHAZADA, EXENTA = 'PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXENTA'


def aprobacion_de(obra):
    return obra.get('aprobacion_finanzas') or APROBADA


def puede_operar(obra):
    """¿Ya puede iniciarse o delegarse a terreno? Solo si Finanzas la aprobó (o está exenta)."""
    return aprobacion_de(obra) in (APROBADA, EXENTA)


def avisar_obra_por_aprobar(obra):
    """Aviso a Finanzas: Operaciones creó una obra que espera su aprobación."""
    from accounts.models import CustomUser, Role
    from notificaciones.models import Notification, notificar
    destino = CustomUser.objects.filter(role=Role.FINANZAS, is_active=True)
    return notificar(destino, f"Nueva obra {obra['id']} ({obra.get('nombre') or 'sin nombre'}) creada por Operaciones. Espera tu aprobación.", Notification.Tipo.GENERAL)


def avisar_presupuesto_por_aprobar(presupuesto, remitente=None):
    """Aviso a Finanzas y a la Gerencia General: un presupuesto fue enviado a aprobación. No avisa a quien lo envió."""
    from accounts.models import CustomUser, Role
    from notificaciones.models import Notification, notificar
    destino = CustomUser.objects.filter(role__in=(Role.FINANZAS, Role.ADMIN), is_active=True)
    if remitente is not None:
        destino = destino.exclude(pk=remitente.pk)
    titulo = presupuesto.get('titulo') or 'sin título'
    return notificar(destino, f"Presupuesto {presupuesto['id']} ({titulo}) enviado a aprobación. Espera tu revisión.", Notification.Tipo.GENERAL)
