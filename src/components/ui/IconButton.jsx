import { forwardRef } from 'react'
import { cn } from './cn'

/** Botón cuadrado solo-ícono. `label` es obligatorio por accesibilidad. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = 'md', className, ...rest },
  ref,
) {
  const dim = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-slate-100 hover:text-ink disabled:text-ink-faint',
        dim,
        className,
      )}
      {...rest}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
})
