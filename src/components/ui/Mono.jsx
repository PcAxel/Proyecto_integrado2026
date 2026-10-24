import { cn } from './cn'

/** Texto en JetBrains Mono para montos, códigos, RUTs y fechas. */
export function Mono({ children, className, as: Tag = 'span' }) {
  return <Tag className={cn('font-mono tabular-nums', className)}>{children}</Tag>
}
