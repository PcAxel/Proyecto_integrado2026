import { cn } from './cn'

const TONES = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', neutral: 'bg-ink-faint' }

export function StatusDot({ tone = 'neutral', label, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-ink-soft', className)}>
      <span className={cn('h-2 w-2 rounded-full', TONES[tone])} />
      {label}
    </span>
  )
}
