import { fechaLocal } from './format'

const dos = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${dos(m)}-${dos(d)}`

/** Atajos de periodo para el informe: {desde, hasta} en AAAA-MM-DD ('' = sin límite). `hoy` se inyecta para poder probarlo. */
export function periodoRapido(clave, hoy = fechaLocal()) {
  const y = Number(hoy.slice(0, 4))
  const m = Number(hoy.slice(5, 7))
  if (clave === 'mes') return { desde: iso(y, m, 1), hasta: iso(y, m, new Date(y, m, 0).getDate()) }
  if (clave === 'mes_anterior') {
    const [ya, ma] = m === 1 ? [y - 1, 12] : [y, m - 1]
    return { desde: iso(ya, ma, 1), hasta: iso(ya, ma, new Date(ya, ma, 0).getDate()) }
  }
  if (clave === 'anio') return { desde: iso(y, 1, 1), hasta: iso(y, 12, 31) }
  return { desde: '', hasta: '' }
}

/** Mensaje si el rango no sirve; null si está bien. */
export function errorPeriodo({ desde, hasta }) {
  if (desde && hasta && desde > hasta) return 'La fecha final no puede ser anterior a la inicial.'
  return null
}
