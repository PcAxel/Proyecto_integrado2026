import { StatusBadge, Mono } from '@/components/ui'
import { estadoStock, esCritico, superaMaximo } from '@/domain/cardex'

const TIPO = { OK: 'success', BAJO: 'warning', SIN_STOCK: 'critical' }
const TEXTO = { OK: 'Normal', BAJO: 'Bajo mínimo', SIN_STOCK: 'Sin stock' }

export function StockBadge({ stock, minimo, critico = 0, maximo = 0, unidad, compacto = false }) {
  const estado = estadoStock(stock, minimo)
  const critica = esCritico(stock, critico)
  return (
    <span className="inline-flex items-center gap-2">
      <Mono className="font-medium">{stock} <span className="text-ink-soft">{unidad}</span></Mono>
      {!compacto && <StatusBadge type={critica ? 'critical' : TIPO[estado]} label={critica ? 'Crítico' : TEXTO[estado]} />}
      {!compacto && superaMaximo(stock, maximo) && <StatusBadge type="warning" label="Sobre el máximo" />}
    </span>
  )
}
