/**
 * Señalización de estados («Nunca solo color»). Puro: sin React ni DOM.
 * Cada estado se distingue por tres canales a la vez: el texto, el color y —en modo daltonismo— un ícono y la forma del borde.
 */

export const TIPOS_ESTADO = ['critical', 'warning', 'success', 'info', 'neutral']

/** Ícono universal por tipo (modo daltonismo): ⚠️ para crítico y advertencia, ✅ para correcto, ℹ️ para informativo. Neutral no lleva. */
export const ICONO_ESTADO = { critical: '⚠️', warning: '⚠️', success: '✅', info: 'ℹ️', neutral: null }

/** Lo que anuncia un lector de pantalla antes de la etiqueta. */
export const PREFIJO_ACCESIBLE = { critical: 'Estado crítico', warning: 'Advertencia', success: 'Estado correcto', info: 'Información', neutral: 'Estado' }

export const normalizarTipoEstado = (type) => (TIPOS_ESTADO.includes(type) ? type : 'neutral')

/** Texto para `aria-label`: «Estado crítico: Stock Crítico». Se usa siempre, con o sin modo daltonismo. */
export function etiquetaAccesible(type, label) {
  const t = normalizarTipoEstado(type)
  return `${PREFIJO_ACCESIBLE[t]}: ${String(label ?? '').trim()}`
}

/** Preferencias de accesibilidad guardadas en el navegador: lo inválido vuelve al valor por defecto (apagado). */
export function normalizarPrefsAccesibilidad(crudo) {
  const c = crudo && typeof crudo === 'object' ? crudo : {}
  return { colorBlindMode: c.colorBlindMode === true }
}
