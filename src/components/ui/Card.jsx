import { cn } from './cn'

/** Panel de datos. `icon` y `subtitle` son opcionales; el encabezado se omite si no hay título ni acción. */
export function Card({ title, subtitle, icon: Icon, action, children, className, padded = true }) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand"><Icon className="h-4 w-4" /></span>}
            <div className="min-w-0">
              <h2 className="t-display truncate text-[17px] leading-tight text-ink">{title}</h2>
              {subtitle && <p className="truncate text-xs text-ink-soft">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}
