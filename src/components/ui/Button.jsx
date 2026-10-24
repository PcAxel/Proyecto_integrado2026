import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-slate-300',
  secondary: 'bg-surface text-ink border border-line hover:bg-slate-50 disabled:text-ink-faint',
  danger: 'bg-crit text-white hover:bg-red-700 disabled:bg-slate-300',
  ghost: 'text-ink-soft hover:bg-slate-100 hover:text-ink disabled:text-ink-faint',
}
const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-14 px-6 text-base', // 56 px · objetivo táctil PWA (P6)
}

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
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
})
