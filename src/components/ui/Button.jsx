import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

const VARIANTS = {
  primary: 'bg-brand text-white shadow-press hover:bg-brand-dark active:translate-y-px active:shadow-none disabled:bg-slate-300 disabled:shadow-none',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-brand/50 hover:bg-brand-tint/50 active:translate-y-px disabled:border-line disabled:text-ink-faint disabled:hover:bg-surface',
  danger: 'bg-crit text-white shadow-press hover:bg-[#AD2F26] active:translate-y-px disabled:bg-slate-300 disabled:shadow-none',
  ghost: 'text-ink-soft hover:bg-slate-100 hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent',
  // Para paneles oscuros (instrumentos)
  light: 'bg-white text-deep shadow-sm hover:bg-ice active:translate-y-px',
  inverse: 'border border-white/25 bg-white/10 text-white hover:bg-white/20 active:translate-y-px',
}
const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-14 px-6 text-base', // 56 px · objetivo táctil PWA (P6)
}

const BASE = 'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 disabled:cursor-not-allowed'

/** Clases de un botón, para aplicarlas a enlaces (`<Link>`) que deben verse como botones. */
export const botonClases = (variant = 'primary', size = 'md') => cn(BASE, VARIANTS[variant], SIZES[size])

/**
 * @param {{variant?: keyof typeof VARIANTS, size?: keyof typeof SIZES, loading?: boolean, icon?: import('react').ElementType} & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
})
