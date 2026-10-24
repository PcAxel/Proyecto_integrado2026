import { cn } from './cn'

const TONES = { neutral: 'text-ink', ok: 'text-ok', warn: 'text-warn', crit: 'text-crit' }

/** Tarjeta de indicador. `value` ya viene formateado (usa formatCLP para montos). */
export function KpiTile({ label, value, hint, icon: Icon, tone = 'neutral' }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <p className="min-w-0 line-clamp-2 text-xs font-medium leading-snug text-ink-soft">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-faint" />}
      </div>
      <p className={cn('mt-2 truncate font-mono text-[clamp(1.05rem,1.4vw,1.5rem)] font-semibold tabular-nums', TONES[tone])}>{value}</p>
      {hint && <p className="mt-1 line-clamp-2 text-xs leading-snug text-ink-faint">{hint}</p>}
    </div>
  )
}
