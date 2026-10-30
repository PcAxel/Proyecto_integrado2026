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
        'inline-flex items-center justify-center rounded-lg text-ink-soft transition-colors duration-150 hover:bg-brand-tint hover:text-brand active:scale-95 disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint',
        dim,
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  )
})
