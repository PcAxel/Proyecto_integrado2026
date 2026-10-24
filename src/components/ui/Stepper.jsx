import { Check } from 'lucide-react'
import { cn } from './cn'

/** @param {{steps: string[], current: number}} props  current es base 0 */
export function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progreso">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-brand bg-brand text-white',
                active && 'border-brand bg-brand-tint text-brand',
                !done && !active && 'border-line bg-surface text-ink-faint',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs font-medium sm:inline', active ? 'text-ink' : 'text-ink-soft')}>{label}</span>
            {i < steps.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-brand' : 'bg-line')} />}
          </li>
        )
      })}
    </ol>
  )
}
