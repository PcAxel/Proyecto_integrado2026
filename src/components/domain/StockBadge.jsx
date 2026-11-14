import { StatusBadge, Mono } from '@/components/ui'
import { estadoStock } from '@/domain/cardex'

const TIPO = { OK: 'success', BAJO: 'warning', SIN_STOCK: 'critical' }
const TEXTO = { OK: 'Normal', BAJO: 'Bajo mínimo', SIN_STOCK: 'Sin stock' }

export function StockBadge({ stock, minimo, unidad, compacto = false }) {
  const estado = estadoStock(stock, minimo)
  return (
    <span className="inline-flex items-center gap-2">
      <Mono className="font-medium">{stock} <span className="text-ink-soft">{unidad}</span></Mono>
      {!compacto && <StatusBadge type={TIPO[estado]} label={TEXTO[estado]} />}
    </span>
  )
}
