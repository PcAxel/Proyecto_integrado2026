import { evaluarChecklist } from './checklist.js'
import { nuevoClientId } from './sync.js'

/** Pasos del wizard de Hoja de Servicio en la PWA. */
export const PASOS_HOJA = ['Obra', 'Checklist', 'Fotos', 'Horas', 'Cierre']

export const HORAS_MAX_DIA = 16
export const FOTOS_MIN = 2

/**
 * @typedef {{obra_id:string, checklist:Record<string,any>, fotos:any[], horas_trabajadas:number|null,
 *   materiales:Array<{articulo_id:string,cantidad:number}>, observaciones:string, firma:string|null}} BorradorHoja
 */

/** @returns {BorradorHoja} */
export const borradorVacio = (obraId = '') => ({
  client_id: nuevoClientId(), obra_id: obraId, checklist: {}, fotos: [], horas_trabajadas: null, materiales: [], observaciones: '', firma: null,
})

/**
 * Valida un paso del wizard (índice base 0).
 * @param {number} paso @param {BorradorHoja} b
 * @returns {{ok:boolean, error?:string}}
 */
export function validarPasoHoja(paso, b) {
  switch (paso) {
    case 0:
      return b.obra_id ? { ok: true } : { ok: false, error: 'Selecciona la obra.' }
    case 1:
      return evaluarChecklist(b.checklist).completo ? { ok: true } : { ok: false, error: 'Completa los 5 puntos del checklist.' }
    case 2:
      return b.fotos.length >= FOTOS_MIN ? { ok: true } : { ok: false, error: `Toma al menos ${FOTOS_MIN} fotos (antes y después).` }
    case 3:
      if (!(b.horas_trabajadas > 0)) return { ok: false, error: 'Indica las horas trabajadas.' }
      return b.horas_trabajadas <= HORAS_MAX_DIA ? { ok: true } : { ok: false, error: `Máximo ${HORAS_MAX_DIA} horas por hoja.` }
    case 4:
      return b.firma ? { ok: true } : { ok: false, error: 'Falta la firma del cliente.' }
    default:
      return { ok: false, error: 'Paso desconocido.' }
  }
}

/** Primer paso inválido, o -1 si la hoja está lista para enviarse. @param {BorradorHoja} b */
export function primerPasoIncompleto(b) {
  return PASOS_HOJA.findIndex((_, i) => !validarPasoHoja(i, b).ok)
}
