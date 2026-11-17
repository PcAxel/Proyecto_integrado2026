"""Compras (procurement): solicitud de compra del Jefe de Bodega → aprobación de Finanzas → órdenes de compra a proveedores.

Aprobar y rechazar solo ocurren aquí (el lote genérico no puede cambiar una solicitud ni crear una orden): el servidor arma las órdenes con el
proveedor y el último costo de cada artículo, así que nadie puede inventar precios ni destinatarios.
"""
from decimal import Decimal

from django.db import transaction

from accounts.models import CustomUser, Role
from notificaciones.models import Notification, notificar

from . import dominio as dom
from . import tablas
from .escritura import ReglaError, ahora, exigir, fila, filas, siguiente_id, uid
from .models import Registro

MAX_MOTIVO = 300


def _solicitud_pendiente(user, solicitud_id):
    exigir(tablas.tiene(user, ['compras.aprobar']), 'No tiene permiso para esta operación.', 403, 'permission_denied')
    reg = Registro.objects.select_for_update().filter(tabla='solicitudes_compra', rid=solicitud_id).first()
    if reg is None:
        raise ReglaError('Solicitud no encontrada.', 404, 'not_found')
    exigir(reg.datos.get('estado') == 'PENDIENTE', 'La solicitud ya fue resuelta.', 409, 'estado_invalido')
    return reg


def _avisar_al_solicitante(solicitud, mensaje, tipo):
    destino = CustomUser.objects.filter(pk=int(solicitud['solicitante_id'].split('-')[1]), is_active=True)
    notificar(destino, mensaje, tipo)


def emitir_ordenes(user, solicitud_id):
    """Aprueba la solicitud y emite UNA orden de compra por proveedor (cada artículo va a su proveedor habitual, al último costo)."""
    with transaction.atomic():
        reg = _solicitud_pendiente(user, solicitud_id)
        sol = reg.datos
        por_proveedor = {}
        for it in sol['items']:
            art = fila('articulos', it['articulo_id'])
            exigir(art and art.get('activo'), 'Hay un artículo inexistente o inactivo.')
            prov = fila('proveedores', art.get('proveedor_id'))
            exigir(prov and prov.get('activo'), f"{art['sku']} no tiene un proveedor activo: asígnalo antes de comprar.")
            exigir(dom.es_numero(art.get('costo_unitario')) and art['costo_unitario'] > 0, f"{art['sku']} no tiene costo registrado: no se puede emitir la orden.")
            sub = round(Decimal(str(it['cantidad'])) * Decimal(str(art['costo_unitario'])))
            por_proveedor.setdefault(prov['id'], []).append({
                'articulo_id': art['id'], 'sku': art['sku'], 'nombre': art['nombre'], 'unidad': art.get('unidad'), 'cantidad': it['cantidad'],
                'precio_unitario': art['costo_unitario'], 'subtotal': int(sub)})
        ids = []
        for proveedor_id, items in por_proveedor.items():
            oid = siguiente_id('ordenes_compra')
            neto = sum(i['subtotal'] for i in items)
            Registro.objects.create(tabla='ordenes_compra', rid=oid, datos={
                'solicitud_id': solicitud_id, 'proveedor_id': proveedor_id, 'fecha': ahora(), 'estado': 'EMITIDA', 'items': items,
                'emitida_por': uid(user), **dom.desglosar_total(neto)})
            ids.append(oid)
        reg.datos = {**sol, 'estado': 'APROBADA', 'orden_ids': ids, 'resuelto_por': uid(user), 'resuelto_en': ahora(), 'motivo_rechazo': None}
        reg.save(update_fields=['datos', 'actualizado'])
        _avisar_al_solicitante(sol, f"Tu solicitud de compra {solicitud_id} fue aprobada: se emitieron las órdenes {', '.join(ids)}.", Notification.Tipo.BODEGA_APROBADA)
        return {**reg.fila()}, ids


def rechazar(user, solicitud_id, motivo):
    motivo = str(motivo or '').strip()
    exigir(motivo, 'Debe indicar el motivo del rechazo.')
    exigir(len(motivo) <= MAX_MOTIVO, 'El motivo es demasiado largo.')
    with transaction.atomic():
        reg = _solicitud_pendiente(user, solicitud_id)
        reg.datos = {**reg.datos, 'estado': 'RECHAZADA', 'orden_ids': [], 'resuelto_por': uid(user), 'resuelto_en': ahora(), 'motivo_rechazo': motivo}
        reg.save(update_fields=['datos', 'actualizado'])
        _avisar_al_solicitante(reg.datos, f'Tu solicitud de compra {solicitud_id} fue rechazada: {motivo}', Notification.Tipo.GENERAL)
        return reg.fila()


def avisar_nueva_solicitud(solicitud_id, items):
    """Aviso a Finanzas cuando Bodega crea una solicitud."""
    notificar(CustomUser.objects.filter(role=Role.FINANZAS, is_active=True),
              f'Nueva solicitud de compra {solicitud_id} de Bodega ({len(items)} artículo{"s" if len(items) != 1 else ""}). Revísala en Aprobación de Compras.', Notification.Tipo.GENERAL)
