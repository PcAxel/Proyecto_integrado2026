/** Textos del control de intentos de ingreso (el servidor decide las esperas y los topes; aquí solo se muestran). */

/** 5 → «5 s», 90 → «1 min 30 s», 3600 → «60 min». */
export function formatoEspera(segundos) {
  const s = Math.max(0, Math.ceil(Number(segundos) || 0))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const resto = s % 60
  return resto ? `${min} min ${resto} s` : `${min} min`
}

/** Lo que el servidor contó en un intento fallido → lo que se muestra. `restantes` es null en terreno (sin tope de intentos). */
export function resumenFallo(data) {
  if (!data) return null
  const bloqueada = Boolean(data.bloqueada) || data.code === 'account_locked'
  const restantes = Number.isInteger(data.intentos_restantes) ? data.intentos_restantes : null
  return {
    bloqueada,
    restantes,
    oficina: restantes !== null,
    sugerirRecuperar: Boolean(data.sugerir_recuperar) && !bloqueada,
    espera: Number(data.espera_segundos) || 0,
  }
}

export const textoRestantes = (n) => (n === 1 ? 'Te queda 1 intento.' : `Te quedan ${n} intentos.`)
