import { cn } from './cn'

export const inputBase =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 hover:border-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:border-line disabled:bg-slate-50 disabled:text-ink-faint disabled:hover:border-line'

/** Envoltorio con etiqueta, ayuda y error. */
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-crit">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>
      )}
    </label>
  )
}
