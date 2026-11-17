import { bloques, inline } from './markdown'

/**
 * Informes en Markdown (reporte de rotación): además de lo que entiende `markdown.js`, reconoce tablas y el nivel de cada título.
 * Devuelve datos, nunca HTML: quien dibuja crea elementos de React, así el texto que venga de la IA no se interpreta como HTML.
 * @returns {Array<{tipo:'tabla', cabecera:string[], filas:string[][]} | {tipo:'h', nivel:number, texto:string} | {tipo:'p'|'ul'|'ol'|'hr', texto?:string, items?:string[]}>}
 */
export function bloquesInforme(markdown) {
  const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const esSeparador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
  const out = []
  let texto = []
  const volcar = () => {
    if (!texto.length) return
    // El nivel del título se pierde en `bloques`: se recupera contando las almohadillas de cada línea de título, en orden.
    const niveles = texto.map((l) => l.match(/^(#{1,4})\s+/)?.[1].length).filter(Boolean)
    for (const b of bloques(texto.join('\n'))) out.push(b.tipo === 'h' ? { ...b, nivel: niveles.shift() ?? 2 } : b)
    texto = []
  }
  const lineas = String(markdown ?? '').replace(/\r/g, '').split('\n')
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim().startsWith('|') && esSeparador(lineas[i + 1] ?? '')) {
      volcar()
      const cabecera = celdas(lineas[i])
      const filas = []
      for (i += 2; i < lineas.length && lineas[i].trim().startsWith('|'); i++) filas.push(celdas(lineas[i]))
      i -= 1
      out.push({ tipo: 'tabla', cabecera, filas })
    } else texto.push(lineas[i])
  }
  volcar()
  return out
}

/** Quita el énfasis con guiones bajos (`_texto_`), que `inline` no interpreta. */
export const sinCursiva = (t) => String(t).replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1$2')

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Documento HTML autónomo para imprimir o guardar como PDF. Todo el contenido se escapa: nada del informe llega como HTML. */
export function informeAHtml(markdown, titulo = 'Informe') {
  const frag = (t) => inline(sinCursiva(t)).map((f) => (typeof f === 'string' ? escapar(f) : f.t === 'b' ? `<strong>${escapar(f.v)}</strong>` : `<code>${escapar(f.v)}</code>`)).join('')
  const cuerpo = bloquesInforme(markdown).map((b) => {
    if (b.tipo === 'hr') return '<hr>'
    if (b.tipo === 'h') return `<h${Math.min(b.nivel, 3)}>${frag(b.texto)}</h${Math.min(b.nivel, 3)}>`
    if (b.tipo === 'ul' || b.tipo === 'ol') return `<${b.tipo}>${b.items.map((it) => `<li>${frag(it)}</li>`).join('')}</${b.tipo}>`
    if (b.tipo === 'tabla') return `<table><thead><tr>${b.cabecera.map((c) => `<th>${frag(c)}</th>`).join('')}</tr></thead><tbody>${b.filas.map((f) => `<tr>${f.map((c) => `<td>${frag(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    return `<p>${frag(b.texto).replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>
body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#16242e;max-width:820px;margin:32px auto;padding:0 24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #d5dde3;padding-bottom:4px}h3{font-size:14px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12.5px}th,td{border:1px solid #c9d3da;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3f6}
ul,ol{padding-left:20px}li{margin:3px 0}code{font-family:ui-monospace,monospace;font-size:.9em}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>${cuerpo}</body></html>`
}
