"""Cruce de tres documentos: orden de compra ↔ recepción de bodega ↔ factura.

El estado de una factura se CALCULA al leer (no se guarda): así, si llega una recepción tardía, la factura se desbloquea sola, y la pantalla, el
informe y el agente de IA ven siempre las mismas cifras. Solo la liberación manual (`liberacion` en la factura) se guarda, con quién y por qué.

Estados de una factura de compra:
- SIN_ORDEN: compra directa, sin orden de compra. No se bloquea; se marca para que se vea.
- CONCILIADA: lo facturado coincide con lo pedido y lo recibido, y el precio con el de la orden (tolerancia de precio: `TOLERANCIA_PRECIO_PCT`).
- PENDIENTE_RECEPCION: se facturó algo de lo que todavía no llegó nada. No es un error: espera la mercadería.
- BLOQUEADA_POR_DISCREPANCIA: faltante en la entrega, facturado sobre lo pedido, artículo que no estaba en la orden o precio mayor al pactado.
- LIBERADA: estaba bloqueada y Finanzas la liberó con un motivo (las discrepancias se conservan como antecedente).

Tipos de discrepancia: FALTANTE_DE_ENTREGA, SOBRE_PEDIDO, ARTICULO_NO_PEDIDO, PRECIO_MAYOR. Cantidad: debe coincidir exacto.
Cada unidad se atribuye una sola vez: si una orden se factura en varias facturas, la primera consume primero lo recibido y lo pedido."""
from collections import defaultdict

from . import dominio as dom
from .informes import _tabla

TOLERANCIA_PRECIO_PCT = 1.0
SIN_ORDEN, CONCILIADA, PENDIENTE_RECEPCION, BLOQUEADA, LIBERADA = 'SIN_ORDEN', 'CONCILIADA', 'PENDIENTE_RECEPCION', 'BLOQUEADA_POR_DISCREPANCIA', 'LIBERADA'
FALTANTE, SOBRE_PEDIDO, NO_PEDIDO, PRECIO_MAYOR = 'FALTANTE_DE_ENTREGA', 'SOBRE_PEDIDO', 'ARTICULO_NO_PEDIDO', 'PRECIO_MAYOR'
TIPOS = (FALTANTE, SOBRE_PEDIDO, NO_PEDIDO, PRECIO_MAYOR)


def _con_iva(neto):
    return dom.desglosar_total(round(neto))['total']


def conciliar_factura(factura, orden, recibido, facturado_antes):
    """Estado de UNA factura. `orden`: la orden de compra (dict) o None; `recibido`: {articulo_id: unidades recibidas contra esa orden};
    `facturado_antes`: {articulo_id: unidades que ya cobraron las facturas anteriores de la misma orden}. Función pura (sin base de datos)."""
    base = {'factura_id': factura.get('id'), 'orden_compra_id': factura.get('orden_compra_id'), 'discrepancias': [], 'monto_retenido_neto': 0, 'monto_retenido': 0,
            'monto_pendiente_recepcion': 0, 'liberacion': factura.get('liberacion')}
    if orden is None:
        return {**base, 'estado': SIN_ORDEN}
    pedido = {i['articulo_id']: i for i in orden.get('items') or []}
    descuentos = factura.get('descuentos') or []
    discrepancias, retenido, pendiente = [], 0, 0
    for it in factura.get('items') or []:
        art, q = it['articulo_id'], it['cantidad']
        precio = dom.calcular_neto(it['precio_lista'], descuentos)
        linea = pedido.get(art)
        if linea is None:
            monto = round(q * precio)
            discrepancias.append({'tipo': NO_PEDIDO, 'articulo_id': art, 'cantidad': q, 'monto_neto': monto})
            retenido += monto
            continue
        antes, entregado = facturado_antes.get(art, 0), recibido.get(art, 0)
        sin_cubrir = max(0, q - max(0, entregado - antes))   # unidades de esta factura que la recepción no cubre
        exceso = max(0, q - max(0, linea['cantidad'] - antes))  # unidades que superan lo pedido
        faltante = max(0, sin_cubrir - exceso)               # no cubiertas pero dentro de lo pedido: aún faltan por llegar
        if exceso:
            discrepancias.append({'tipo': SOBRE_PEDIDO, 'articulo_id': art, 'cantidad': exceso, 'monto_neto': round(exceso * precio)})
            retenido += round(exceso * precio)
        if faltante:
            if entregado > 0:  # llegó algo, pero menos de lo facturado: faltante real
                discrepancias.append({'tipo': FALTANTE, 'articulo_id': art, 'cantidad': faltante, 'monto_neto': round(faltante * precio)})
                retenido += round(faltante * precio)
            else:              # todavía no llegó nada: solo se espera la entrega
                pendiente += round(faltante * precio)
        sobreprecio = precio - linea['precio_unitario']
        if linea['precio_unitario'] > 0 and sobreprecio / linea['precio_unitario'] * 100 > TOLERANCIA_PRECIO_PCT:
            resto = q - exceso - (faltante if entregado > 0 else 0)  # las unidades ya retenidas no se cuentan dos veces
            if resto > 0:
                monto = round(sobreprecio * resto)
                discrepancias.append({'tipo': PRECIO_MAYOR, 'articulo_id': art, 'cantidad': resto, 'monto_neto': monto,
                                      'precio_factura': precio, 'precio_orden': linea['precio_unitario']})
                retenido += monto
    if discrepancias:
        estado = BLOQUEADA
    elif pendiente:
        estado = PENDIENTE_RECEPCION
    else:
        estado = CONCILIADA
    if estado == BLOQUEADA and factura.get('liberacion'):
        estado = LIBERADA
    bloqueada = estado == BLOQUEADA
    return {**base, 'estado': estado, 'discrepancias': discrepancias, 'monto_pendiente_recepcion': pendiente,
            'monto_retenido_neto': retenido if bloqueada else 0, 'monto_retenido': _con_iva(retenido) if bloqueada else 0}


def _recepciones_por_orden():
    """{orden_id: {articulo_id: unidades}} con las recepciones enlazadas a cada orden (ORM)."""
    r = defaultdict(lambda: defaultdict(float))
    for m in _tabla('cardex').filter(datos__tipo='ENTRADA_RECEPCION').values('datos'):
        d = m['datos']
        if d.get('orden_compra_id'):
            r[d['orden_compra_id']][d['articulo_id']] += d['cantidad']
    return r


def conciliar_todas():
    """{factura_id: resultado} para todas las facturas de compra. Se arma con una pasada sobre órdenes, recepciones y facturas."""
    ordenes = {o['rid']: {'id': o['rid'], **o['datos']} for o in _tabla('ordenes_compra').values('rid', 'datos')}
    recibidos = _recepciones_por_orden()
    facturas = sorted(({'id': f['rid'], **f['datos']} for f in _tabla('facturas').values('rid', 'datos')), key=lambda f: f['id'])
    acumulado = defaultdict(lambda: defaultdict(float))  # facturado por orden y artículo hasta la factura anterior
    salida = {}
    for f in facturas:
        oc_id = f.get('orden_compra_id')
        salida[f['id']] = conciliar_factura(f, ordenes.get(oc_id) if oc_id else None, dict(recibidos.get(oc_id, {})), dict(acumulado[oc_id]))
        if oc_id:
            for it in f.get('items') or []:
                acumulado[oc_id][it['articulo_id']] += it['cantidad']
    return salida


def resumen(resultados, desde=None, hasta=None, facturas=None):
    """Totales de un conjunto de resultados: cuántas por estado y monto retenido. `facturas`: {id: fila} para filtrar por fecha (opcional)."""
    cuenta, retenido, retenido_neto, pendiente = defaultdict(int), 0, 0, 0
    for fid, r in resultados.items():
        if facturas is not None:
            fecha = (facturas.get(fid) or {}).get('fecha') or ''
            if (desde and fecha < desde) or (hasta and fecha > hasta):
                continue
        cuenta[r['estado']] += 1
        retenido += r['monto_retenido']
        retenido_neto += r['monto_retenido_neto']
        pendiente += r['monto_pendiente_recepcion']
    return {'por_estado': dict(cuenta), 'monto_retenido': retenido, 'monto_retenido_neto': retenido_neto, 'monto_pendiente_recepcion': pendiente}
