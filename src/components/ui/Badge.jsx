import { cn } from './cn'

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-brand-tint text-brand',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  crit: 'bg-crit-bg text-crit',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}
