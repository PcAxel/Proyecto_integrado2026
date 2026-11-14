/**
 * Lector de textos (accesibilidad). Puro: sin DOM ni `window`, para poder probarlo.
 * El navegador lee con las voces del sistema (Web Speech API); aquí solo se decide QUÉ voz usar y CÓMO partir el texto.
 */

/** Orden de preferencia de idioma: chileno, otros latinoamericanos y, al final, español de España. */
export const IDIOMAS_PREFERIDOS = ['es-CL', 'es-419', 'es-MX', 'es-US', 'es-AR', 'es-CO', 'es-ES']

const norm = (s) => String(s ?? '').replace('_', '-').toLowerCase() // algunos sistemas devuelven «es_CL»

/**
 * Elige la mejor voz en español disponible. Prefiere el idioma pedido (por defecto es-CL), luego otros acentos latinoamericanos, luego es-ES,
 * y dentro de cada idioma las voces locales (sin red) antes que las remotas. Devuelve null si no hay ninguna en español.
 * @param {Array<{lang:string, name?:string, localService?:boolean}>} voces  @param {string} [preferido]
 */
export function elegirVoz(voces, preferido = 'es-CL') {
  const espanol = (voces ?? []).filter((v) => norm(v.lang).startsWith('es'))
  if (!espanol.length) return null
  const orden = [preferido, ...IDIOMAS_PREFERIDOS].map(norm)
  const puesto = (v) => { const i = orden.indexOf(norm(v.lang)); return i === -1 ? orden.length : i }
  return [...espanol].sort((a, b) => puesto(a) - puesto(b) || Number(Boolean(b.localService)) - Number(Boolean(a.localService)))[0]
}

/** Quita lo que el lector pronunciaría mal: espacios repetidos, saltos de línea y símbolos de adorno. */
export function limpiarTexto(texto) {
  return String(texto ?? '').replace(/[•·▪►▶→]/g, ', ').replace(/[\u00A0\s]+/g, ' ').trim()
}

/**
 * Parte un texto largo en trozos de hasta `max` caracteres, cortando en el final de una frase (o, si no hay, en un espacio).
 * Chrome corta la lectura de textos largos pasados los ~15 segundos, así que se lee trozo a trozo.
 * @returns {string[]}
 */
export function dividirTexto(texto, max = 180) {
  const limpio = limpiarTexto(texto)
  if (!limpio) return []
  const frases = limpio.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [limpio]
  const trozos = []
  let actual = ''
  const cerrar = () => { if (actual.trim()) trozos.push(actual.trim()); actual = '' }
  for (const frase of frases) {
    if (frase.length > max) { // una frase sin puntos y muy larga: se corta en espacios
      cerrar()
      let resto = frase
      while (resto.length > max) {
        const corte = resto.lastIndexOf(' ', max)
        const n = corte > 0 ? corte : max
        trozos.push(resto.slice(0, n).trim())
        resto = resto.slice(n)
      }
      actual = resto
    } else if ((actual + frase).length > max) { cerrar(); actual = frase } else actual += frase
  }
  cerrar()
  return trozos.filter(Boolean)
}
