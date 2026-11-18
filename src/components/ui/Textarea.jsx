import { forwardRef } from 'react'
import { Field, inputBase } from './Field'
import { cn } from './cn'

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, rows = 3, obligatorio, opcional, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} className={className} obligatorio={obligatorio ?? rest.required} opcional={opcional}>
      <textarea ref={ref} rows={rows} className={cn(inputBase, 'py-2 resize-none', error && 'border-crit')} {...rest} />
    </Field>
  )
})
