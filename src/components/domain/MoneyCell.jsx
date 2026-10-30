import { formatCLP } from '@/domain/money'
import { cn } from '@/components/ui'

/** Monto en CLP con cifras tabulares (alinean en columnas). Si el valor no llegó (sin permiso, P5) muestra "—". */
export function MoneyCell({ value, className }) {
  if (value === undefined || value === null) {
    return <span className="text-ink-faint" title="Sin permiso para ver costos">—</span>
  }
  return <span className={cn('whitespace-nowrap tabular-nums', className)}>{formatCLP(value)}</span>
}
