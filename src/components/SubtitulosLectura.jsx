import { Captions, Pause, Play, Square } from 'lucide-react'
import { useLectorStore } from '@/stores/lectorStore'

/**
 * Subtítulos de lo que el lector está diciendo: el trozo en curso en español y, si el navegador traduce y la persona lo activó, también en inglés.
 * Aparece abajo al centro mientras se lee y desaparece al terminar. No lo lee el propio lector (`data-no-leer`).
 */
export function SubtitulosLectura() {
  const { estado, subtitulos, trozos, indice, ingles, traducciones, traduccion, pausar, reanudar, detener } = useLectorStore()
  if (!subtitulos || estado === 'inactivo' || !trozos[indice]) return null
  const traducido = traducciones[indice]
  return (
    <section data-no-leer role="region" aria-label="Subtítulos de la lectura"
      className="pointer-events-auto fixed bottom-24 left-4 right-20 z-[70] rounded-xl bg-black/85 p-3.5 text-white shadow-pop backdrop-blur sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-[min(42rem,calc(100vw-9rem))] sm:-translate-x-1/2">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">
        <Captions className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Subtítulos · {indice + 1} de {trozos.length}</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={estado === 'pausado' ? reanudar : pausar} aria-label={estado === 'pausado' ? 'Continuar la lectura' : 'Pausar la lectura'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:bg-white/15 hover:text-white">
            {estado === 'pausado' ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={detener} aria-label="Detener la lectura" className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:bg-white/15 hover:text-white">
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
          </button>
        </span>
      </div>
      <p lang="es" className="text-base font-medium leading-snug sm:text-lg">{trozos[indice]}</p>
      {ingles && (
        <p lang="en" className="mt-1.5 border-t border-white/15 pt-1.5 text-sm italic leading-snug text-sky-200 sm:text-base">
          {traducido ?? (traduccion.estado === 'error' ? 'Translation unavailable' : 'Translating…')}
        </p>
      )}
    </section>
  )
}
