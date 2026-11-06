import { X } from 'lucide-react'

/** Chip «Filtrando por …» que aparece al llegar desde la búsqueda global. */
export function FiltroBusqueda({ texto, onQuitar }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 pt-4 text-sm">
      <span className="text-ink-soft">Filtrando por</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 font-medium text-brand">«{texto}»
        <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-white" onClick={onQuitar}><X className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  )
}
