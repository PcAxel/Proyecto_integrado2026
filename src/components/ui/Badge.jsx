import { cn } from './cn'

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-300/60',
  info: 'bg-brand-tint text-brand-dark ring-brand/25',
  ok: 'bg-ok-bg text-ok ring-ok/25',
  warn: 'bg-warn-bg text-warn ring-warn/30',
  crit: 'bg-crit-bg text-crit ring-crit/25',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}
