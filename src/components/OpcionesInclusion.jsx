import { useEffect, useRef, useState } from 'react'
import { Accessibility, Info } from 'lucide-react'
import { cn } from '@/components/ui'
import { TextReaderButton } from './TextReaderButton'

const INTRO = 'Pronto podrás ajustar el tamaño de letra y el contraste, y escuchar el contenido de la pantalla.'

/**
 * Botón de accesibilidad de la barra superior (junto al de modo día/noche): abre el menú «Opciones de Inclusión».
 * Hoy lleva un texto de relleno; aquí se irán agregando los controles de tamaño de letra y contraste.
 * Se cierra con Esc, con un clic fuera o al volver a pulsar el botón.
 */
export function OpcionesInclusion({ alineado = 'derecha' }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') { setAbierto(false); raiz.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  return (
    <div ref={raiz} className="relative">
      <button
        type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog" aria-label="Opciones de inclusión y accesibilidad" title="Accesibilidad"
        className={cn('flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-fyag-ice/50',
          abierto ? 'border-fyag-ice/40 bg-fyag-deep/30 text-fyag-cream' : 'border-fyag-ice/15 text-fyag-ice')}
      >
        <Accessibility className="h-4 w-4" aria-hidden="true" />
      </button>
      {abierto && (
        <div role="dialog" aria-label="Opciones de Inclusión"
          className={cn('absolute top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop', alineado === 'derecha' ? 'right-0' : 'left-0')}>
          <header className="flex items-center gap-2.5 border-b border-line bg-slate-50 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><Accessibility className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-tight">Opciones de Inclusión</h2>
              <p className="text-xs text-ink-soft">Haz el sistema más cómodo para ti</p>
            </div>
          </header>
          <div className="p-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-line-strong p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm leading-snug text-ink-soft">{INTRO}</p>
              <TextReaderButton text={INTRO} label="la descripción de las opciones" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
