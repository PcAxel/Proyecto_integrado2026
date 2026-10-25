import { formatNumero } from './format.js'

export const ESTADOS_VEHICULO = { ACTIVO: 'ACTIVO', EN_TALLER: 'EN_TALLER' }
export const ESTADO_VEHICULO_LABEL = { ACTIVO: 'Activo', EN_TALLER: 'En taller' }

/** Recorrido máximo creíble en una sola hoja de servicio; evita errores de tipeo (un cero de más). */
export const KM_MAX_POR_HOJA = 1500

/** 48250 → "48.250 km". @param {number|null|undefined} n */
export const formatKm = (n) => (Number.isFinite(n) ? `${formatNumero(n)} km` : '—')

/**
 * Valida el registro de kilometraje de una hoja. Sin vehículo no se exige nada.
 * @param {{vehiculo_id?:string, km_salida?:number|null, km_regreso?:number|null}} b
 * @returns {{ok:boolean, error?:string, recorrido?:number}}
 */
export function validarKilometraje({ vehiculo_id, km_salida, km_regreso }) {
  if (!vehiculo_id) return { ok: true }
  if (!Number.isFinite(km_salida) || km_salida < 0) return { ok: false, error: 'Indica el kilometraje de salida.' }
  if (!Number.isFinite(km_regreso) || km_regreso < 0) return { ok: false, error: 'Indica el kilometraje de regreso.' }
  if (km_regreso <= km_salida) return { ok: false, error: 'El kilometraje de regreso debe ser mayor al de salida.' }
  const recorrido = km_regreso - km_salida
  if (recorrido > KM_MAX_POR_HOJA) return { ok: false, error: `El recorrido (${formatNumero(recorrido)} km) supera el máximo de ${formatNumero(KM_MAX_POR_HOJA)} km por hoja. Revisa los valores.` }
  return { ok: true, recorrido }
}

/** El odómetro del vehículo solo avanza: un registro atrasado (sync offline) no lo hace retroceder. */
export const kmActualizado = (kmActual, kmRegreso) => Math.max(kmActual, kmRegreso)

/** Resumen de la flota para indicadores. @param {Array<{estado:string, km_actual:number, activo?:boolean}>} flota */
export function resumenFlota(flota) {
  const vigentes = flota.filter((v) => v.activo !== false)
  return {
    vehiculos: vigentes.length,
    operativos: vigentes.filter((v) => v.estado === ESTADOS_VEHICULO.ACTIVO).length,
    enTaller: vigentes.filter((v) => v.estado === ESTADOS_VEHICULO.EN_TALLER).length,
    kmTotal: vigentes.reduce((s, v) => s + (v.km_actual ?? 0), 0),
  }
}
