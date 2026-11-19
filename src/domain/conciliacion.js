import { formatCLP } from './money'

/** Estados del cruce orden de compra ↔ recepción ↔ factura (los calcula el servidor; aquí solo cómo se muestran). */
export const ESTADO_CONCILIACION = {
  SIN_ORDEN: { label: 'Sin orden', tone: 'neutral', ayuda: 'Compra directa: no se puede cruzar con una orden de compra.' },
  CONCILIADA: { label: 'Conciliada', tone: 'ok', ayuda: 'Lo facturado coincide con lo pedido y lo recibido.' },
  PENDIENTE_RECEPCION: { label: 'Pendiente de recepción', tone: 'warn', ayuda: 'Se facturó mercadería que aún no llega a bodega.' },
  BLOQUEADA_POR_DISCREPANCIA: { label: 'Bloqueada', tone: 'crit', ayuda: 'Lo facturado no coincide con lo pedido o lo recibido.' },
  LIBERADA: { label: 'Liberada', tone: 'info', ayuda: 'Tenía discrepancias y Finanzas la liberó con un motivo.' },
}

export const TIPO_DISCREPANCIA = {
  FALTANTE_DE_ENTREGA: 'Faltante de entrega',
  SOBRE_PEDIDO: 'Facturado sobre lo pedido',
  ARTICULO_NO_PEDIDO: 'Artículo que no estaba en la orden',
  PRECIO_MAYOR: 'Precio mayor al pactado',
}

export const estadoDe = (conciliacion, facturaId) => conciliacion?.[facturaId]?.estado ?? null

/** Frase corta de una discrepancia: «Faltante de entrega · 4 unid. · $4.000 neto». */
export function describirDiscrepancia(d) {
  const base = `${TIPO_DISCREPANCIA[d.tipo] ?? d.tipo} · ${d.cantidad} unid. · ${formatCLP(d.monto_neto)} neto`
  return d.tipo === 'PRECIO_MAYOR' ? `${base} (factura ${formatCLP(d.precio_factura)} vs orden ${formatCLP(d.precio_orden)})` : base
}

/** Cuántas facturas hay por estado, para el resumen sobre la tabla. */
export function contarPorEstado(conciliacion, ids) {
  const r = {}
  for (const id of ids) {
    const e = estadoDe(conciliacion, id)
    if (e) r[e] = (r[e] ?? 0) + 1
  }
  return r
}

/** Un motivo de liberación sirve si explica algo (mínimo 10 caracteres reales). */
export const motivoLiberacionValido = (m) => (m ?? '').trim().length >= 10 && (m ?? '').trim().length <= 300
