import { cn } from './cn'

// Variante para el lienzo oscuro del ERP: los textos grises y divisores de los hijos se re-tiñen sin tocar sus componentes.
const CARD_OSCURA = 'min-w-0 rounded-xl border border-fyag-ice/15 bg-fyag-panel text-fyag-cream [&_.text-ink-soft]:text-fyag-ice/80 [&_.text-ink-faint]:text-fyag-ice/60 [&_.text-ink]:text-fyag-cream [&_.divide-line>*]:!border-fyag-ice/10 [&_.border-line]:border-fyag-ice/10'

/** Panel de datos. `icon` y `subtitle` son opcionales; el encabezado se omite si no hay título ni acción. */
export function Card({ title, subtitle, icon: Icon, action, children, className, padded = true, oscuro = false }) {
  return (
    <section className={cn(oscuro ? CARD_OSCURA : 'card', className)}>
      {(title || action) && (
        <header className={cn('flex items-center justify-between gap-3 border-b px-5 py-3.5', oscuro ? 'border-fyag-ice/10' : 'border-line')}>
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', oscuro ? 'bg-fyag-teal/25 text-fyag-ice' : 'bg-brand-tint text-brand')}><Icon className="h-4 w-4" /></span>}
            <div className="min-w-0">
              <h2 className={cn('t-display truncate text-[17px] leading-tight', oscuro ? 'text-fyag-cream' : 'text-ink')}>{title}</h2>
              {subtitle && <p className={cn('truncate text-xs', oscuro ? 'text-fyag-ice/80' : 'text-ink-soft')}>{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}
