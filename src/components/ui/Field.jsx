
import { cn } from './cn'

export const inputBase =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand disabled:bg-slate-50 disabled:text-ink-faint'

/** Envoltorio con etiqueta, ayuda y error. */
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-crit">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      )}
    </label>
  )
}

