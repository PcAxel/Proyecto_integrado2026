import { IVA_RATE } from './money.js'
import { can } from './rbac.js'

export const MARGEN_MINIMO = 20
export const MARGEN_SALUDABLE = 30
export const MARGEN_OBJETIVO = 25

/**
 * Simulador de rentabilidad previa (RF05). Margen sobre venta neta.
 * @param {{
 *   materiales?: Array<{cantidad:number, costo_unitario:number}>,
 *   mano_obra?: Array<{horas:number, costo_hora_hombre:number}>,
 *   adicionales?: Array<{monto:number}>,
 *   precio_venta_neto: number
 * }} p
 */
export function simularRentabilidad({ materiales = [], mano_obra = [], adicionales = [], precio_venta_neto }) {
  const costoMateriales = materiales.reduce((a, m) => a + m.cantidad * m.costo_unitario, 0)
  const costoManoObra = mano_obra.reduce((a, m) => a + m.horas * m.costo_hora_hombre, 0)
  const costoAdicionales = adicionales.reduce((a, m) => a + m.monto, 0)
  const costoTotal = Math.round(costoMateriales + costoManoObra + costoAdicionales)
  const venta = Math.round(precio_venta_neto || 0)
  const iva = Math.round(venta * IVA_RATE)
  const margenMonto = venta - costoTotal
  const margenPct = venta > 0 ? Math.round((margenMonto / venta) * 1000) / 10 : 0
  const semaforo = semaforoMargen(margenPct)
  return {
    costoMateriales: Math.round(costoMateriales),
    costoManoObra: Math.round(costoManoObra),
    costoAdicionales: Math.round(costoAdicionales),
    costoTotal,
    ventaNeto: venta,
    iva,
    ventaTotal: venta + iva,
    margenMonto,
    margenPct,
    semaforo,
    bajoMinimo: margenPct < MARGEN_MINIMO,
    precioSugerido: precioParaMargen(costoTotal, MARGEN_OBJETIVO),
  }
}

/**
 * Precio de venta neto que logra el margen objetivo (redondeado a $1.000 hacia arriba).
 * @param {number} costoTotal @param {number} [margenPct]
 */
export function precioParaMargen(costoTotal, margenPct = MARGEN_OBJETIVO) {
  if (costoTotal <= 0) return 0
  return Math.ceil(costoTotal / (1 - margenPct / 100) / 1000) * 1000
}

/**
 * Aprobación: se necesita permiso y, con margen < 20 %, solo ADMIN_GENERAL puede aprobar.
 * @param {import('./rbac.js').Rol} rol
 * @param {{bajoMinimo: boolean}} simulacion
 * @returns {{ok: boolean, motivo?: string}}
 */
export function puedeAprobarPresupuesto(rol, simulacion) {
  if (!can(rol, 'presupuestos.aprobar')) return { ok: false, motivo: 'Tu rol no puede aprobar presupuestos.' }
  if (simulacion.bajoMinimo && rol !== 'ADMIN_GENERAL') {
    return { ok: false, motivo: `Margen bajo ${MARGEN_MINIMO} %: requiere aprobación de Gerencia.` }
  }
  return { ok: true }
}

/** @param {number} margenPct @returns {'ROJO'|'AMBAR'|'VERDE'} */
export function semaforoMargen(margenPct) {
  return margenPct < MARGEN_MINIMO ? 'ROJO' : margenPct < MARGEN_SALUDABLE ? 'AMBAR' : 'VERDE'
}

/**
 * Margen efectivo de una obra con su costo real.
 * @param {number} ventaNeto @param {number} costoReal
 */
export function margenReal(ventaNeto, costoReal) {
  const margenMonto = ventaNeto - costoReal
  const margenPct = ventaNeto > 0 ? Math.round((margenMonto / ventaNeto) * 1000) / 10 : 0
  return { margenMonto, margenPct, semaforo: semaforoMargen(margenPct) }
}

/**
 * Compara el costo presupuestado con el real. Positivo = sobrecosto.
 * @param {number} presupuestado @param {number} real
 * @returns {{desvioMonto:number, desvioPct:number, estado:'BAJO_PRESUPUESTO'|'EN_RANGO'|'SOBRECOSTO'}}
 */
export function compararCostos(presupuestado, real) {
  const desvioMonto = real - presupuestado
  const desvioPct = presupuestado > 0 ? Math.round((desvioMonto / presupuestado) * 1000) / 10 : 0
  const estado = desvioPct > 5 ? 'SOBRECOSTO' : desvioPct < -5 ? 'BAJO_PRESUPUESTO' : 'EN_RANGO'
  return { desvioMonto, desvioPct, estado }
}

/**
 * Tarifa hora-hombre promedio por cargo, para presupuestar sin exponer fichas individuales.
 * @param {Array<{cargo:string, costo_hora_hombre:number, activo?:boolean}>} personal
 * @returns {Array<{cargo:string, tarifa:number, cantidad:number}>}
 */
export function promedioTarifasPorCargo(personal) {
  const grupos = new Map()
  for (const p of personal.filter((x) => x.activo !== false)) {
    const g = grupos.get(p.cargo) ?? { suma: 0, cantidad: 0 }
    grupos.set(p.cargo, { suma: g.suma + p.costo_hora_hombre, cantidad: g.cantidad + 1 })
  }
  return [...grupos].map(([cargo, g]) => ({ cargo, tarifa: Math.round(g.suma / g.cantidad), cantidad: g.cantidad }))
    .sort((a, b) => b.tarifa - a.tarifa)
}
