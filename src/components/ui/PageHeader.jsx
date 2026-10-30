/** Encabezado de página: título de placa de equipo, una frase de contexto y las acciones principales. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="t-display text-[1.75rem] leading-none text-ink sm:text-[2.1rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
