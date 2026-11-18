import { forwardRef } from 'react'
import { Field, inputBase } from './Field'
import { cn } from './cn'

export const Input = forwardRef(function Input({ label, hint, error, className, mono, size = 'md', obligatorio, opcional, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} className={className} obligatorio={obligatorio ?? rest.required} opcional={opcional}>
      <input ref={ref} className={cn(inputBase, size === 'lg' ? 'h-14 text-base' : 'h-10', mono && 'font-mono', error && 'border-crit')} {...rest} />
    </Field>
  )
})
