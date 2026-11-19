/**
 * Enlace entre orden de compra, recepción y factura. Las recepciones que nombran una orden llevan `orden_compra_id`.
 * (El cruce completo —discrepancias y bloqueo— lo calcula el servidor; aquí solo se ayuda a precargar formularios.)
 */

/** Unidades ya recibidas por artículo contra una orden: { articulo_id: cantidad }. */
export function recibidoPorArticulo(ordenId, movimientos) {
  const r = {}
  for (const m of movimientos) {
    if (m.tipo === 'ENTRADA_RECEPCION' && m.orden_compra_id === ordenId) r[m.articulo_id] = (r[m.articulo_id] ?? 0) + m.cantidad
  }
  return r
}

/** Lo que falta recibir de cada ítem de la orden: [{articulo_id, pedido, recibido, pendiente}] (solo con pendiente > 0). */
export function pendientesDeRecibir(orden, movimientos) {
  const recibido = recibidoPorArticulo(orden.id, movimientos)
  return orden.items
    .map((it) => ({ articulo_id: it.articulo_id, pedido: it.cantidad, recibido: recibido[it.articulo_id] ?? 0 }))
    .map((x) => ({ ...x, pendiente: x.pedido - x.recibido }))
    .filter((x) => x.pendiente > 0)
}

/** Ítems de factura precargados desde la orden (cantidad pedida y precio de la orden): el usuario los revisa y ajusta a lo que dice el papel. */
export const itemsDeFacturaDesdeOrden = (orden) => orden.items.map((it) => ({ articulo_id: it.articulo_id, cantidad: it.cantidad, precio_lista: it.precio_unitario }))
