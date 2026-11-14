import { recortarParaLeer } from '@/domain/lectura'

const BLOQUES = 'p,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd,tr,label,button,a,section,article,header,footer,div'
const OMITIR = 'script,style,noscript,svg,canvas,input,textarea,select,[aria-hidden="true"],[data-no-leer],.sr-only'

/**
 * Texto visible de una zona de la pantalla (por defecto el contenido principal, sin menús). Se recorre el texto real del DOM y se descartan lo oculto,
 * los íconos, los campos de formulario y todo lo marcado con `data-no-leer` (menús, subtítulos, botones de lectura).
 * @returns {{texto: string, recortado: boolean}}
 */
export function textoDeLaPantalla(raiz = document.querySelector('main')) {
  if (!raiz) return { texto: '', recortado: false }
  const partes = []
  const paseo = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const el = n.parentElement
      if (!el || !n.nodeValue.trim() || el.closest(OMITIR)) return NodeFilter.FILTER_REJECT
      return el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    },
  })
  // Los textos de un mismo bloque (p. ej. «Buenas noches» + «, Felipe») se unen sin pausa; al cambiar de bloque se cierra la frase con un punto.
  let bloqueActual = null
  for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
    const bloque = n.parentElement.closest(BLOQUES) ?? raiz
    const texto = n.nodeValue.replace(/\s+/g, ' ').trim()
    if (bloqueActual && bloque !== bloqueActual && partes.length && !/[.!?:;,]$/.test(partes[partes.length - 1])) partes[partes.length - 1] += '.'
    bloqueActual = bloque
    partes.push(texto)
  }
  // Una coma o un punto que quedó solo (texto suelto entre elementos) se pega a lo anterior en vez de leerse como una frase aparte.
  return recortarParaLeer(partes.join(' ').replace(/\s+([,.;:])/g, '$1').replace(/([,;:])\./g, '$1'))
}
