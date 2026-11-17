/**
 * Si el texto de una respuesta del asistente llegó como JSON crudo (a veces dentro de una cerca ```json), extrae solo el mensaje
 * y las opciones rápidas. Si no es JSON válido con `respuesta_texto`, devuelve el texto tal cual.
 * @param {unknown} contenido @param {unknown[]} [opcionesExtra] opciones que ya venían aparte en la respuesta
 * @returns {{texto: string, opciones: string[]}}
 */
export function normalizarRespuestaIA(contenido, opcionesExtra = []) {
  const aparte = limpiarOpciones(opcionesExtra)
  if (typeof contenido !== 'string') return { texto: '', opciones: aparte }
  const crudo = contenido.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (crudo.startsWith('{')) {
    try {
      const d = JSON.parse(crudo)
      if (d && typeof d === 'object' && typeof d.respuesta_texto === 'string') {
        const propias = limpiarOpciones(d.opciones)
        return { texto: d.respuesta_texto, opciones: propias.length ? propias : aparte }
      }
    } catch { /* JSON roto (p. ej. comillas sin escapar en otro campo): se intenta rescatar solo el mensaje */ }
    const m = /^\{\s*"respuesta_texto"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[,}]/s.exec(crudo)
    if (m) {
      try { return { texto: JSON.parse(`"${m[1]}"`), opciones: aparte } } catch { /* se muestra tal cual */ }
    }
  }
  return { texto: contenido, opciones: aparte }
}

const limpiarOpciones = (o) => (Array.isArray(o) ? o.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 4) : [])
