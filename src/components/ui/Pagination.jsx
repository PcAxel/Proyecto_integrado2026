import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './IconButton'

/** @param {{page:number, pageSize:number, total:number, onChange:(p:number)=>void}} props  page es base 0 */
export function Pagination({ page, pageSize, total, onChange }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize))
  const desde = total === 0 ? 0 : page * pageSize + 1
  const hasta = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-soft">
      <span className="font-mono">{desde}–{hasta} de {total}</span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Página anterior" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)} />
        <span className="px-1 font-mono">{page + 1}/{paginas}</span>
        <IconButton icon={ChevronRight} label="Página siguiente" size="sm" disabled={page >= paginas - 1} onClick={() => onChange(page + 1)} />
      </div>
    </div>
  )
}
