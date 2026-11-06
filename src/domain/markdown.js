/**
 * Markdown ligero para las respuestas del asistente: párrafos, títulos, listas, separadores, **negrita** y `código`.
 * Devuelve datos (no HTML): quien lo dibuja crea elementos de React, así que el texto del modelo nunca se interpreta como HTML.
 */

/** @returns {Array<string | {t:'b'|'c', v:string}>} fragmentos de una línea */
export function inline(texto) {
  const partes = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g
  let i = 0
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m.index > i) partes.push(texto.slice(i, m.index))
    partes.push(m[1] !== undefined ? { t: 'b', v: m[1] } : { t: 'c', v: m[2] })
    i = m.index + m[0].length
  }
  if (i < texto.length) partes.push(texto.slice(i))
  return partes
}

/** @returns {Array<{tipo:'p'|'h'|'ul'|'ol'|'hr', texto?:string, items?:string[]}>} */
export function bloques(markdown) {
  const out = []
  let lista = null
  const cerrar = () => { if (lista) { out.push(lista); lista = null } }
  for (const linea of String(markdown ?? '').replace(/\r/g, '').split('\n')) {
    const l = linea.trimEnd()
    let m
    if (!l.trim()) { cerrar(); continue }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { cerrar(); out.push({ tipo: 'hr' }); continue }
    if ((m = l.match(/^#{1,4}\s+(.*)$/))) { cerrar(); out.push({ tipo: 'h', texto: m[1] }); continue }
    if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { if (lista?.tipo !== 'ul') { cerrar(); lista = { tipo: 'ul', items: [] } } lista.items.push(m[1]); continue }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (lista?.tipo !== 'ol') { cerrar(); lista = { tipo: 'ol', items: [] } } lista.items.push(m[1]); continue }
    cerrar()
    const previo = out.at(-1)
    if (previo?.tipo === 'p') previo.texto += `\n${l}` // las líneas seguidas forman un solo párrafo
    else out.push({ tipo: 'p', texto: l })
  }
  cerrar()
  return out
}
