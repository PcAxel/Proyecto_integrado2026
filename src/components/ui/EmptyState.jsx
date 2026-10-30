import { Snowflake } from 'lucide-react'

/** Estado vacío: una invitación a actuar, no un callejón sin salida. */
export function EmptyState({ title, hint, icon: Icon = Snowflake, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand ring-1 ring-brand/15">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-harvest ring-2 ring-white" />
      </span>
      <p className="t-display mt-4 text-lg text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
