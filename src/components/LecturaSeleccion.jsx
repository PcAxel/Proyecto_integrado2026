import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useLectorStore } from '@/stores/lectorStore'
import { recortarParaLeer } from '@/domain/lectura'

/**
 * Cuando seleccionas texto en la pantalla aparece un botón flotante «Escuchar» sobre la selección. También recuerda la última selección para el
 * menú «Opciones de Inclusión». No interfiere con la selección (el botón no le quita el foco) ni aparece dentro de campos de formulario o menús.
 */
export function LecturaSeleccion() {
  const soportado = useLectorStore((s) => s.soportado)
  const [caja, setCaja] = useState(null) // { top, left, texto }

  useEffect(() => {
    if (!soportado) return undefined
    let cuadro = 0
    const medir = () => {
      const sel = window.getSelection()
      const texto = sel && !sel.isCollapsed ? sel.toString().trim() : ''
      const nodo = sel?.anchorNode?.nodeType === 1 ? sel.anchorNode : sel?.anchorNode?.parentElement
      if (texto.length < 3 || !nodo || nodo.closest('[data-no-leer],input,textarea,[contenteditable="true"]')) { setCaja(null); return }
      useLectorStore.getState().setUltimaSeleccion(recortarParaLeer(texto).texto)
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (!r.width && !r.height) { setCaja(null); return }
      const arriba = r.top > 52
      setCaja({ top: arriba ? r.top - 42 : r.bottom + 8, left: Math.min(Math.max(r.left + r.width / 2 - 52, 8), window.innerWidth - 112), texto })
    }
    const programar = () => { cancelAnimationFrame(cuadro); cuadro = requestAnimationFrame(medir) }
    document.addEventListener('selectionchange', programar)
    window.addEventListener('scroll', programar, true)
    window.addEventListener('resize', programar)
    return () => {
      cancelAnimationFrame(cuadro)
      document.removeEventListener('selectionchange', programar)
      window.removeEventListener('scroll', programar, true)
      window.removeEventListener('resize', programar)
    }
  }, [soportado])

  if (!caja) return null
  return (
    <button
      type="button" data-no-leer
      onPointerDown={(e) => e.preventDefault()} // no le quita la selección al texto
      onClick={() => { useLectorStore.getState().iniciar(caja.texto, 'seleccion'); setCaja(null) }}
      style={{ top: caja.top, left: caja.left }}
      className="fixed z-[65] flex h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-semibold text-white shadow-pop transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />Escuchar
    </button>
  )
}
