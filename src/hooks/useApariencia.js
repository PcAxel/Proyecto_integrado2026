import { useEffect } from 'react'
import { useTemaStore } from '@/stores/temaStore'
import { esNoche, tokensDe } from '@/domain/temas'

/**
 * Aplica la apariencia de la persona al documento: colores como variables CSS en <html> (las usa Tailwind), tamaño de letra y modo.
 * Se usa en los dos marcos (ERP y app de terreno); al salir de ellos se deja todo como estaba para el login y las páginas públicas.
 * @param {string|number} usuarioId  @param {number} nivelDefecto 100 = empieza oscuro, 0 = empieza claro
 */
export function useApariencia(usuarioId, nivelDefecto) {
  const { nivel, claro, oscuro, escala, cargar } = useTemaStore()
  useEffect(() => { cargar(usuarioId, nivelDefecto) }, [usuarioId, nivelDefecto, cargar])

  useEffect(() => {
    const el = document.documentElement
    const tokens = tokensDe({ nivel, claro, oscuro })
    for (const [k, v] of Object.entries(tokens)) el.style.setProperty(`--c-${k}`, v)
    el.style.fontSize = `${escala}%`
    el.style.colorScheme = esNoche(nivel) ? 'dark' : 'light'
    el.classList.add('tema-vars')
    el.classList.toggle('tema-claro', !esNoche(nivel))
  }, [nivel, claro, oscuro, escala])

  useEffect(() => () => {
    const el = document.documentElement
    for (const k of Object.keys(tokensDe({ nivel: 0, claro: 'crema', oscuro: 'petroleo' }))) el.style.removeProperty(`--c-${k}`)
    el.style.removeProperty('font-size')
    el.style.removeProperty('color-scheme')
    el.classList.remove('tema-vars', 'tema-claro')
  }, [])
}
