/** Dictado por voz (voz → texto). Puro: sin DOM, para poder probarlo. El reconocimiento lo hace el navegador (Web Speech API). */

/** El constructor de reconocimiento de voz del navegador, o null si no existe (Firefox, algunos navegadores internos). @param {any} [win] */
export function constructorDictado(win = typeof window !== 'undefined' ? window : undefined) {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null
}

/**
 * Arma el texto del cuadro mientras se dicta: lo que ya estaba escrito + lo reconocido de forma definitiva + lo que se está diciendo ahora.
 * Se une con un solo espacio y nunca duplica separadores.
 */
export function componerDictado(base = '', finales = '', parcial = '') {
  return [base, finales, parcial].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ')
}

/** Mensaje claro para cada error del reconocimiento. `null` = no mostrar nada (silencio o corte voluntario). */
export function mensajeErrorDictado(codigo) {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Para dictar, permite el micrófono en el navegador (el candado junto a la dirección).'
    case 'audio-capture': return 'No se encontró un micrófono. Conéctalo e inténtalo de nuevo.'
    case 'network': return 'El dictado necesita internet: no se pudo conectar con el servicio de voz del navegador.'
    case 'language-not-supported': return 'Tu navegador no admite dictado en español.'
    case 'no-speech':
    case 'aborted': return null
    default: return 'No se pudo usar el dictado. Puedes escribir el mensaje.'
  }
}
