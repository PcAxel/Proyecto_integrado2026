import { Field, inputBase } from './Field'
import { cn } from './cn'

/**
 * Campo numérico controlado. `value` es number|null; entrega number|null en onChange.
 * `prefix`/`suffix` muestran unidades (ej. "$", "PSI").
 */
export function NumberField({ label, hint, error, value, onChange, prefix, suffix, min, max, step = 1, className, size = 'md', ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-soft">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={cn(
            inputBase,
            'font-mono tabular-nums',
            size === 'lg' ? 'h-14 text-lg' : 'h-10',
            prefix && 'pl-7',
            suffix && 'pr-12',
            error && 'border-crit',
          )}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-soft">{suffix}</span>}
      </div>
    </Field>
  )
}
