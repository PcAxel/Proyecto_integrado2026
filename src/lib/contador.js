import { useEffect, useRef, useState } from 'react'

const NUMERO = /-?\d[\d.]*(?:,\d+)?/

/** Separa el primer número de un texto formateado en es-CL: "$21.657.000" → { antes:'$', valor:21657000, ... }. */
export function partirNumero(texto) {
  const m = NUMERO.exec(String(texto))
  if (!m) return null
  const [token] = m
  const [entero, dec = ''] = token.split(',')
  return {
    antes: texto.slice(0, m.index),
    despues: texto.slice(m.index + token.length),
    valor: Number(`${entero.replace(/\./g, '')}${dec ? `.${dec}` : ''}`),
    decimales: dec.length,
    agrupado: token.includes('.'),
  }
}

/** Texto con el número en un punto de la animación (progreso 0–1), conservando prefijo, sufijo y formato. */
export function textoAnimado(texto, progreso) {
  const p = partirNumero(texto)
  if (!p || progreso >= 1) return texto
  const suave = 1 - (1 - Math.max(0, progreso)) ** 3 // salida suave: arranca rápido y asienta despacio
  const actual = Number((p.valor * suave).toFixed(p.decimales))
  const [ent, dec = ''] = Math.abs(actual).toFixed(p.decimales).split('.')
  const entero = p.agrupado ? ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ent
  return `${p.antes}${actual < 0 ? '-' : ''}${entero}${dec ? `,${dec}` : ''}${p.despues}`
}

/**
 * Cuenta hasta el valor al montarse. Solo anima la primera vez y respeta «reducir movimiento».
 * @param {string|number} valor @param {{activo?: boolean, duracion?: number}} [opciones]
 */
export function useContador(valor, { activo = true, duracion = 900 } = {}) {
  const texto = String(valor)
  const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const animable = Boolean(activo && !reducir && partirNumero(texto)) // booleano: un objeto nuevo en cada render reiniciaría la animación
  const [mostrado, setMostrado] = useState(animable ? textoAnimado(texto, 0) : texto)
  const hecho = useRef(false)

  useEffect(() => {
    if (!animable || hecho.current) { setMostrado(texto); return undefined }
    let raf
    const t0 = performance.now()
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / duracion)
      setMostrado(textoAnimado(texto, p))
      if (p < 1) raf = requestAnimationFrame(paso)
      else hecho.current = true
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [texto, animable, duracion])

  return mostrado
}
