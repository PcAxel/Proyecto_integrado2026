import { cn } from './cn'
import { useContador } from '@/lib/contador'

// Cada tono pinta una cinta lateral y el ícono; el valor solo se tiñe cuando el estado importa.
const TONOS = {
  neutral: { cinta: 'bg-brand', chip: 'bg-brand-tint text-brand', valor: 'text-ink' },
  ok: { cinta: 'bg-ok', chip: 'bg-ok-bg text-ok', valor: 'text-ok' },
  warn: { cinta: 'bg-harvest', chip: 'bg-warn-bg text-warn', valor: 'text-warn' },
  crit: { cinta: 'bg-crit', chip: 'bg-crit-bg text-crit', valor: 'text-crit' },
}

/** Indicador. `value` ya viene formateado (usa formatCLP para montos); con `animar` cuenta hasta el valor al montarse. */
export function KpiTile({ label, value, hint, icon: Icon, tone = 'neutral', animar = false }) {
  const t = TONOS[tone]
  const mostrado = useContador(value, { activo: animar && typeof value !== 'object' })
  return (
    <div className="card group relative overflow-hidden p-4 pl-5 transition-shadow duration-200 hover:shadow-lift sm:p-5 sm:pl-6">
      <span className={cn('absolute inset-y-0 left-0 w-1', t.cinta)} aria-hidden="true" />
      <div className="flex items-center gap-2">
        {Icon && <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', t.chip)}><Icon className="h-3.5 w-3.5" /></span>}
        <p className="min-w-0 line-clamp-2 text-[13px] font-medium leading-snug text-ink-soft">{label}</p>
      </div>
      <p className={cn('t-display mt-3 truncate text-[clamp(1.7rem,2.1vw,2.35rem)] leading-none tabular-nums', t.valor)}>{typeof value === 'object' ? value : mostrado}</p>
      {hint && <p className="mt-2 line-clamp-2 text-xs leading-snug text-ink-soft">{hint}</p>}
    </div>
  )
}
