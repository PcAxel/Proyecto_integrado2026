import { Badge, Mono } from '@/components/ui'
import { estadoStock } from '@/domain/cardex'

const TONO = { OK: 'ok', BAJO: 'warn', SIN_STOCK: 'crit' }
const TEXTO = { OK: 'Normal', BAJO: 'Bajo mínimo', SIN_STOCK: 'Sin stock' }

export function StockBadge({ stock, minimo, unidad, compacto = false }) {
  const estado = estadoStock(stock, minimo)
  return (
    <span className="inline-flex items-center gap-2">
      <Mono className="font-medium">{stock} <span className="text-ink-soft">{unidad}</span></Mono>
      {!compacto && <Badge tone={TONO[estado]}>{TEXTO[estado]}</Badge>}
    </span>
  )
}
