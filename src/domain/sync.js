/**
 * Estados de un ítem en la cola offline.
 * PENDIENTE: espera conexión o reintento. ERROR: el servidor lo rechazó y requiere corrección.
 */
export const ESTADOS_COLA = { PENDIENTE: 'PENDIENTE', ERROR: 'ERROR' }

/**
 * Un fallo de red o 5xx se reintenta; un 4xx es una decisión del servidor y no se reintenta solo.
 * @param {{status?: number}|null|undefined} err
 * @returns {'REINTENTAR'|'RECHAZADO'}
 */
export function clasificarErrorSync(err) {
  const s = err?.status
  return !s || s >= 500 ? 'REINTENTAR' : 'RECHAZADO'
}

/** @param {Array<{estado:string, tipo:string}>} items */
export function resumenCola(items) {
  return {
    total: items.length,
    pendientes: items.filter((i) => i.estado === ESTADOS_COLA.PENDIENTE).length,
    errores: items.filter((i) => i.estado === ESTADOS_COLA.ERROR).length,
    hojas: items.filter((i) => i.tipo === 'HOJA').length,
    retiros: items.filter((i) => i.tipo === 'RETIRO').length,
  }
}

/** Id estable generado en el dispositivo; permite reintentos idempotentes. */
export const nuevoClientId = (ahora = Date.now(), azar = Math.random()) => `C-${ahora.toString(36)}-${Math.floor(azar * 1e6).toString(36)}`
