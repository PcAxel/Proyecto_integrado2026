"""Datos de demostración del cruce orden de compra ↔ recepción ↔ factura: una orden por escenario, con sus recepciones y su factura.

Escenarios (cada uno deja un estado distinto en `erp.conciliacion`): conciliada, pendiente de recepción, faltante de entrega (dos veces, para el ranking de
proveedores), facturado sobre lo pedido, artículo que no estaba en la orden, precio mayor al pactado y un faltante ya liberado por Finanzas.
Es idempotente: si ya hay órdenes de compra no hace nada."""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import CustomUser, Role
from erp import conciliacion, dominio as dom
from erp.escritura import ahora, siguiente_id, uid
from erp.models import Registro

# (nombre, índice de proveedor, pedido, recibido, facturado, factor de precio, ítem extra no pedido, liberada)
ESCENARIOS = (
    ('conciliada', 0, 10, 10, 10, 1.00, False, False),
    ('pendiente de recepción', 1, 8, 0, 8, 1.00, False, False),
    ('faltante de entrega', 0, 12, 7, 12, 1.00, False, False),
    ('facturado sobre lo pedido', 2, 10, 10, 13, 1.00, False, False),
    ('artículo no pedido', 2, 6, 6, 6, 1.00, True, False),
    ('precio mayor al pactado', 0, 5, 5, 5, 1.08, False, False),
    ('faltante liberado', 1, 9, 5, 9, 1.00, False, True),
    ('otro faltante', 0, 10, 8, 10, 1.00, False, False),
)


def _num(v):
    return Decimal(str(v or 0))


def poblar(salida=print):
    """Crea los escenarios. Devuelve cuántos creó (0 si ya había órdenes de compra o no hay proveedores con artículos)."""
    if Registro.objects.filter(tabla='ordenes_compra').exists():
        salida('Ya hay órdenes de compra: no se crea nada.')
        return 0
    articulos = [{'id': r.rid, **r.datos} for r in Registro.objects.filter(tabla='articulos').order_by('rid') if r.datos.get('activo') and _num(r.datos.get('costo_unitario')) > 0]
    por_proveedor = {}
    for a in articulos:
        por_proveedor.setdefault(a.get('proveedor_id'), []).append(a)
    proveedores = [p for p in sorted(por_proveedor) if p]
    if not proveedores:
        salida('No hay proveedores con artículos y costo: no se crea nada.')
        return 0
    bodega = CustomUser.objects.filter(role=Role.JEFE_BODEGA, is_active=True).first() or CustomUser.objects.filter(is_active=True).first()
    finanzas = CustomUser.objects.filter(role=Role.FINANZAS, is_active=True).first() or bodega
    hoy = timezone.localdate()
    creadas = 0
    with transaction.atomic():
        for n, (nombre, ip, pedido, recibido, facturado, factor, extra, liberada) in enumerate(ESCENARIOS, start=1):
            prov = proveedores[ip % len(proveedores)]
            arts = por_proveedor[prov]
            if extra and len(arts) < 2:
                continue
            a = arts[0]
            precio = int(_num(a['costo_unitario']))
            oid = siguiente_id('ordenes_compra')
            fecha_oc = (hoy - timedelta(days=12 + n)).isoformat() + 'T09:00:00'
            neto_oc = pedido * precio
            Registro.objects.create(tabla='ordenes_compra', rid=oid, datos={
                'solicitud_id': None, 'proveedor_id': prov, 'fecha': fecha_oc, 'estado': 'EMITIDA', 'emitida_por': uid(finanzas), 'demo': True,
                'items': [{'articulo_id': a['id'], 'sku': a['sku'], 'nombre': a['nombre'], 'unidad': a.get('unidad'), 'cantidad': pedido, 'precio_unitario': precio, 'subtotal': neto_oc}],
                **dom.desglosar_total(neto_oc)})
            if recibido:
                Registro.objects.create(tabla='cardex', rid=siguiente_id('cardex'), datos={
                    'tipo': 'ENTRADA_RECEPCION', 'fecha': (hoy - timedelta(days=8 + n)).isoformat() + 'T11:00:00', 'signo': 1, 'cantidad': recibido, 'articulo_id': a['id'],
                    'costo_unitario': precio, 'obra_id': None, 'referencia': f'Guía DEMO-{n}', 'reversa_de': None, 'salida_origen_id': None, 'usuario_id': uid(bodega),
                    'orden_compra_id': oid})
            items = [{'articulo_id': a['id'], 'cantidad': facturado, 'precio_lista': round(precio * factor)}]
            if extra:
                b = arts[1]
                items.append({'articulo_id': b['id'], 'cantidad': 2, 'precio_lista': int(_num(b['costo_unitario']))})
            c = dom.calcular_factura(items, [])
            fid = siguiente_id('facturas')
            Registro.objects.create(tabla='facturas', rid=fid, datos={
                'numero': f'DEMO-OC-{n}', 'proveedor_id': prov, 'fecha': (hoy - timedelta(days=3 + n)).isoformat(), 'descuentos': [], 'items': items,
                'neto_bruto': c['bruto'], 'neto': c['neto'], 'iva': c['iva'], 'total': c['total'], 'estado': 'REGISTRADA', 'orden_compra_id': oid, 'demo': True})
            if liberada:
                r = conciliacion.conciliar_todas()[fid]
                reg = Registro.objects.get(tabla='facturas', rid=fid)
                reg.datos = {**reg.datos, 'liberacion': {'por': uid(finanzas), 'motivo': 'La guía 4412 trae las unidades que faltaban (caso de demostración)', 'fecha': ahora(),
                                                          'monto_retenido': r['monto_retenido'], 'discrepancias': r['discrepancias']}}
                reg.save(update_fields=['datos', 'actualizado'])
            salida(f'  {oid} · {fid} · {nombre}')
            creadas += 1
    return creadas
