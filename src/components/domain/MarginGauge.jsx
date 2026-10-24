import { cn, Mono } from '@/components/ui'
import { formatPct } from '@/domain/format'
import { MARGEN_MINIMO, MARGEN_SALUDABLE, semaforoMargen } from '@/domain/rentabilidad'

const COLOR = { ROJO: 'bg-crit', AMBAR: 'bg-warn', VERDE: 'bg-ok' }
const TEXTO = { ROJO: 'text-crit', AMBAR: 'text-warn', VERDE: 'text-ok' }
const TOPE = 50 // la barra llega al 50 % de margen

/** Barra de margen con marcas en el mínimo (20 %) y el nivel saludable (30 %). */
export function MarginGauge({ pct, compact = false }) {
  const sem = semaforoMargen(pct)
  const ancho = Math.min(100, Math.max(0, (pct / TOPE) * 100))
  return (
    <div className={cn('flex items-center gap-2', compact ? 'min-w-[7rem]' : 'w-full')}>
      <div className={cn('relative flex-1 rounded-full bg-slate-100', compact ? 'h-1.5' : 'h-2.5')} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={TOPE}>
        <div className={cn('h-full rounded-full transition-all', COLOR[sem])} style={{ width: `${ancho}%` }} />
        {!compact && [MARGEN_MINIMO, MARGEN_SALUDABLE].map((m) => (
          <span key={m} className="absolute top-[-3px] h-[16px] w-px bg-slate-400" style={{ left: `${(m / TOPE) * 100}%` }} title={`${m} %`} />
        ))}
      </div>
      <Mono className={cn('shrink-0 text-xs font-semibold', TEXTO[sem])}>{formatPct(pct)}</Mono>
    </div>
  )
}
