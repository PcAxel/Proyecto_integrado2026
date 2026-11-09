import { cn } from './cn'
import { useContador } from '@/lib/contador'

// Cada tono pinta una cinta lateral y el ícono; el valor solo se tiñe cuando el estado importa.
const TONOS_OSCUROS = {
  neutral: { cinta: 'bg-fyag-teal', chip: 'bg-fyag-teal/25 text-fyag-ice', valor: 'text-fyag-cream' },
  ok: { cinta: 'bg-ok', chip: 'bg-ok/20 text-ok', valor: 'text-fyag-cream' },
  warn: { cinta: 'bg-fyag-orange', chip: 'bg-fyag-orange/20 text-fyag-orange', valor: 'text-fyag-orange' },
  crit: { cinta: 'bg-fyag-orange', chip: 'bg-fyag-orange/20 text-fyag-orange', valor: 'text-fyag-orange' },
}
const TONOS = {
  neutral: { cinta: 'bg-brand', chip: 'bg-brand-tint text-brand', valor: 'text-ink' },
  ok: { cinta: 'bg-ok', chip: 'bg-ok-bg text-ok', valor: 'text-ok' },
  warn: { cinta: 'bg-harvest', chip: 'bg-warn-bg text-warn', valor: 'text-warn' },
  crit: { cinta: 'bg-crit', chip: 'bg-crit-bg text-crit', valor: 'text-crit' },
}

/** Indicador. `value` ya viene formateado (usa formatCLP para montos); con `animar` cuenta hasta el valor al montarse. */
export function KpiTile({ label, value, hint, icon: Icon, tone = 'neutral', animar = false, oscuro = false }) {
  const t = (oscuro ? TONOS_OSCUROS : TONOS)[tone]
  const mostrado = useContador(value, { activo: animar && typeof value !== 'object' })
  return (
    <div className={cn('group relative overflow-hidden p-4 pl-5 transition-shadow duration-200 sm:p-5 sm:pl-6', oscuro ? 'min-w-0 rounded-xl border border-fyag-ice/15 bg-fyag-panel hover:border-fyag-ice/30' : 'card hover:shadow-lift')}>
      <span className={cn('absolute inset-y-0 left-0 w-1', t.cinta)} aria-hidden="true" />
      <div className="flex items-center gap-2">
        {Icon && <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', t.chip)}><Icon className="h-3.5 w-3.5" /></span>}
        <p className={cn('min-w-0 line-clamp-2 text-[13px] font-medium leading-snug', oscuro ? 'text-fyag-ice/80' : 'text-ink-soft')}>{label}</p>
      </div>
      <p className={cn('t-display mt-3 truncate text-[clamp(1.7rem,2.1vw,2.35rem)] leading-none tabular-nums', t.valor)}>{typeof value === 'object' ? value : mostrado}</p>
      {hint && <p className={cn('mt-2 line-clamp-2 text-xs leading-snug', oscuro ? 'text-fyag-ice/70' : 'text-ink-soft')}>{hint}</p>}
    </div>
  )
}
