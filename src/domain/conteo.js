/**
 * Conteo físico de inventario. Puro (P3).
 *
 * El conteo es CIEGO: quien cuenta ingresa solo lo que encontró. El sistema compara con su stock calculado y, si hay
 * diferencia, exige motivo y la aprobación de OTRA persona antes de generar el ajuste en el Cardex.
 */
export const MOTIVO_MIN = 5

export const ESTADOS_CONTEO = { CONFORME: 'CONFORME', PENDIENTE: 'PENDIENTE', APROBADO: 'APROBADO', RECHAZADO: 'RECHAZADO' }
export const ESTADO_CONTEO_LABEL = { CONFORME: 'Conforme', PENDIENTE: 'Por aprobar', APROBADO: 'Ajustado', RECHAZADO: 'Rechazado' }

/**
 * @param {{stockSistema:number, contado:number, costo?:number, motivo?:string}} p
 * @returns {{ok:true, diferencia:number, estado:'CONFORME'|'PENDIENTE', valor:number|null} | {ok:false, error:string, diferencia?:number}}
 */
export function evaluarConteo({ stockSistema, contado, costo, motivo = '' }) {
  if (!Number.isFinite(contado) || contado < 0) return { ok: false, error: 'Indica la cantidad contada (0 o más).' }
  const diferencia = Math.round((contado - stockSistema) * 1000) / 1000
  if (diferencia !== 0 && motivo.trim().length < MOTIVO_MIN) {
    return { ok: false, diferencia, error: `Hay una diferencia en el conteo: indica el motivo (mín. ${MOTIVO_MIN} caracteres).` }
  }
  return { ok: true, diferencia, estado: diferencia === 0 ? 'CONFORME' : 'PENDIENTE', valor: Number.isFinite(costo) ? Math.round(diferencia * costo) : null }
}

/** ¿Quién puede aprobar este conteo? Nunca quien lo hizo. */
export const puedeAprobarConteo = (conteo, usuarioId) => conteo.estado === ESTADOS_CONTEO.PENDIENTE && conteo.creado_por !== usuarioId
