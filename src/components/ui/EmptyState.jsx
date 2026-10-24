import { Inbox } from 'lucide-react'

export function EmptyState({ title, hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-ink-faint" />
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-soft">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
