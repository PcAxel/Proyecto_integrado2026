/** "2026-10-23T09:05:00" → "23-10-2026" (sin pasar por Date: evita desfases de zona horaria). @param {string} iso */
export function formatFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

/** "2026-10-23T09:05:00" → "23-10-2026 09:05". @param {string} iso */
export function formatFechaHora(iso) {
  if (!iso) return '—'
  return `${formatFecha(iso)} ${iso.slice(11, 16)}`
}

/** Cantidad con signo explícito: +5 / −3. @param {number} n */
export function conSigno(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
}

const dos = (n) => String(n).padStart(2, '0')

/** "YYYY-MM-DDTHH:mm:ss" en hora LOCAL (toISOString entregaría UTC). @param {Date} [d] */
export function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
}

/** "YYYY-MM-DD" local. @param {Date} [d] */
export const fechaLocal = (d = new Date()) => isoLocal(d).slice(0, 10)

/** 48250 → "48.250" (separador de miles chileno, sin decimales). @param {number} n */
export const formatNumero = (n) => (Number.isFinite(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—')

/** 34.5 → "34,5 %". @param {number} n */
export const formatPct = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(1).replace('.', ',')} %`
