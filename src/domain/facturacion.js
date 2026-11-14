/** Estados de la factura electrónica en la pantalla. Puro: sin React ni red. */

/** Cómo se muestra cada estado del SII (el tipo es el de `StatusBadge`: nunca solo color). */
export const ESTADO_SII = {
  NO_EMITIDO: { label: 'No Emitido', type: 'neutral' },
  PROCESANDO: { label: 'Procesando', type: 'warning' },
  ACEPTADO: { label: 'Aceptado', type: 'success' },
  RECHAZADO: { label: 'Rechazado', type: 'critical' },
}

/**
 * Qué muestra el panel a partir de lo que dice el servidor y de si hay una emisión en curso en este navegador.
 * - 'emitir': botón para emitir · 'procesando': botón gris/naranja con spinner · 'aceptado': verde con el PDF
 * - 'rechazado': error con reintento · 'bloqueado': no se puede emitir (con el motivo)
 * @param {{estado_sii?: string, emitible?: boolean}|null} dte  @param {boolean} emitiendo
 * @returns {'cargando'|'emitir'|'procesando'|'aceptado'|'rechazado'|'bloqueado'}
 */
export function modoPanel(dte, emitiendo) {
  if (emitiendo) return 'procesando'
  if (!dte) return 'cargando'
  if (dte.estado_sii === 'ACEPTADO') return 'aceptado'
  if (dte.estado_sii === 'PROCESANDO') return dte.emitible ? 'emitir' : 'procesando' // «Procesando» vigente de otra persona: no se puede emitir
  if (dte.estado_sii === 'RECHAZADO') return dte.emitible ? 'rechazado' : 'bloqueado'
  return dte.emitible ? 'emitir' : 'bloqueado'
}

/** Mensaje claro para el error de una emisión. @param {{status?: number, code?: string, message?: string}} err */
export function mensajeErrorEmision(err) {
  if (err?.status === 403) return 'Tu rol no puede emitir facturas electrónicas.'
  if (err?.status === 409) return err.message || 'La factura de esta orden ya fue emitida o se está procesando.'
  if (err?.status === 422 || err?.status === 404) return err.message || 'Esta orden no se puede facturar.'
  if (err?.status === 502) return err.message || 'El SII no aceptó el documento. Puedes intentarlo de nuevo.'
  if (err?.status === 0) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  return err?.message || 'No se pudo emitir la factura.'
}
