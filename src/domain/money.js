/** Tasa de IVA vigente en Chile. */
export const IVA_RATE = 0.19

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/**
 * Formatea un monto como pesos chilenos. Ej: 1250000 → "$1.250.000"
 * @param {number} value
 * @returns {string}
 */
export function formatCLP(value) {
  const n = Number.isFinite(value) ? Math.round(value) : 0
  // El signo se antepone a mano: Intl lo ubica distinto según el motor ("-$1" vs "$-1").
  return `${n < 0 ? '-' : ''}${clpFormatter.format(Math.abs(n)).replace(/\s/g, '')}`
}

/**
 * Aplica descuentos porcentuales en cascada (uno sobre el resultado del anterior).
 * @param {number} bruto
 * @param {number[]} [descuentos] porcentajes 0–100 (máx. 3 en compras)
 * @returns {number} monto neto, redondeado a peso entero
 */
export function calcularNeto(bruto, descuentos = []) {
  const neto = descuentos.reduce((acc, d) => acc * (1 - clamp(d, 0, 100) / 100), bruto)
  return Math.round(neto)
}

/**
 * @param {number} neto
 * @returns {number} IVA 19 % redondeado
 */
export function calcularIVA(neto) {
  return Math.round(neto * IVA_RATE)
}

/**
 * @param {number} neto
 * @returns {{ neto: number, iva: number, total: number }}
 */
export function desglosarTotal(neto) {
  const iva = calcularIVA(neto)
  return { neto, iva, total: neto + iva }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0))
}

/**
 * Costo unitario real de una compra tras descuentos en cascada.
 * @param {number} precioLista
 * @param {number[]} [descuentos]
 * @returns {number}
 */
export function costoUnitarioNeto(precioLista, descuentos = []) {
  return calcularNeto(precioLista, descuentos)
}

/**
 * Totales de una factura de compra con hasta 3 descuentos en cascada.
 * @param {Array<{cantidad:number, precio_lista:number}>} items
 * @param {number[]} [descuentos]
 * @returns {{bruto:number, pasos:Array<{pct:number, monto:number}>, descuentoTotal:number, neto:number, iva:number, total:number}}
 */
export function calcularFactura(items, descuentos = []) {
  const bruto = items.reduce((s, it) => s + (it.cantidad || 0) * (it.precio_lista || 0), 0)
  const pasos = []
  let acumulado = bruto
  for (const pct of descuentos.filter((d) => d > 0)) {
    const monto = Math.round(acumulado * (clamp(pct, 0, 100) / 100))
    pasos.push({ pct, monto })
    acumulado -= monto
  }
  const neto = Math.round(acumulado)
  return { bruto, pasos, descuentoTotal: bruto - neto, ...desglosarTotal(neto) }
}
