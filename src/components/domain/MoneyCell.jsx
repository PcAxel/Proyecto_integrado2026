import { formatCLP } from '@/domain/money'
import { Mono } from '@/components/ui'

/** Monto en CLP con tipografía mono. Si el valor no llegó (sin permiso, P5) muestra "—". */
export function MoneyCell({ value, className }) {
  if (value === undefined || value === null) {
    return <Mono className="text-ink-faint" title="Sin permiso para ver costos">—</Mono>
  }
  return <Mono className={className}>{formatCLP(value)}</Mono>
}
