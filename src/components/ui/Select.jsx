import { forwardRef } from 'react'
import { Field, inputBase } from './Field'
import { cn } from './cn'

/** @param {{options: Array<{value:string, label:string}>, placeholder?: string} & import('react').SelectHTMLAttributes<HTMLSelectElement>} props */
export const Select = forwardRef(function Select(
  { label, hint, error, options, placeholder, className, size = 'md', ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select ref={ref} className={cn(inputBase, size === 'lg' ? 'h-14 text-base' : 'h-10', error && 'border-crit')} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
})
