import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, TrendingUp, ShoppingCart } from 'lucide-react'
import { Skeleton, cn } from '@/components/ui'
import { finanzasService } from '@/services'
import { formatCLP } from '@/domain/money'
import { fechaLocal } from '@/domain/format'
import { nombreMes, presentarGanancia, presentarIva } from '@/domain/resumenTributario'
import { useResource } from '@/hooks/useResource'

// Rojo y verde explícitos (el tono «crit» del tablero oscuro es naranja): aquí el color es parte del mensaje.
const COLOR = {
  crit: { cinta: 'bg-red-500', valor: 'text-red-400', chip: 'bg-red-500/20 text-red-300' },
  ok: { cinta: 'bg-green-500', valor: 'text-green-400', chip: 'bg-green-500/20 text-green-300' },
  neutral: { cinta: 'bg-fyag-teal', valor: 'text-fyag-cream', chip: 'bg-fyag-teal/25 text-fyag-ice' },
}

function Tarjeta({ titulo, valor, estado, nota, detalle, icono: Icono, tono = 'neutral', testid }) {
  const c = COLOR[tono]
  return (
    <div data-testid={testid} data-tono={tono} className="relative min-w-0 overflow-hidden rounded-xl border border-fyag-ice/15 bg-fyag-panel p-4 pl-5 sm:p-5 sm:pl-6">
      <span className={cn('absolute inset-y-0 left-0 w-1', c.cinta)} aria-hidden="true" />
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', c.chip)}><Icono className="h-3.5 w-3.5" /></span>
        <p className="min-w-0 text-[13px] font-medium leading-snug text-fyag-ice/80">{titulo}</p>
        {estado && <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', c.chip)}>{estado}</span>}
      </div>
      <p className={cn('t-display mt-3 truncate text-[clamp(1.7rem,2.1vw,2.35rem)] leading-none tabular-nums', c.valor)}>{valor}</p>
      <p className="mt-2 text-xs leading-snug text-fyag-ice/70">{nota}</p>
      {detalle && <p className="mt-1 text-xs leading-snug text-fyag-ice/60">{detalle}</p>}
    </div>
  )
}

/** Gastos del mes, ganancia neta y proyección de IVA del mes (el servidor suma y calcula; aquí solo se muestra). */
export function ResumenTributario() {
  const [mes, setMes] = useState(() => fechaLocal().slice(0, 7))
  const { data, error, loading } = useResource(() => finanzasService.resumenTributario(mes), [mes])
  const iva = data && presentarIva(data.iva.saldo)
  const gan = data && presentarGanancia(data.ganancia_neta, data.margen_pct)
  const nc = data?.compras.notas_credito

  return (
    <section aria-label="Resumen tributario y de caja" data-agent-target="resumen-tributario">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Resultado y tributos de {nombreMes(mes)}</h2>
          <p className="text-xs text-ink-soft">Ventas: facturas electrónicas aceptadas. Gastos: facturas de compra menos notas de crédito. Montos netos.</p>
        </div>
        <label className="text-xs font-medium text-ink-soft">
          <span className="mr-2">Mes</span>
          <input type="month" value={mes} max={fechaLocal().slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg border border-fyag-orange/40 bg-fyag-orange/10 p-3 text-sm text-fyag-orange">{error.message}</p>}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {!data && !error && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-[132px] rounded-xl border border-fyag-ice/15 bg-fyag-panel" aria-busy={loading}><Skeleton rows={2} /></div>)}
        {data && (<>
          <Tarjeta testid="tarjeta-gastos" titulo="Gastos del mes" icono={ShoppingCart} valor={formatCLP(data.compras.neto)}
            nota={`${data.compras.facturas} facturas de compra${nc?.cantidad ? ` − ${nc.cantidad} nota(s) de crédito` : ''}`}
            detalle={`IVA crédito: ${formatCLP(data.compras.iva)}`} />
          <Tarjeta testid="tarjeta-ganancia" titulo="Ganancia neta" icono={TrendingUp} tono={gan.tono} estado={gan.estado} valor={formatCLP(data.ganancia_neta)}
            nota={`${formatCLP(data.ventas.neto)} vendidos − ${formatCLP(data.compras.neto)} gastados`} detalle={gan.margen} />
          <Tarjeta testid="tarjeta-iva" titulo="Proyección de impuestos del mes" icono={Landmark} tono={iva.tono} estado={iva.estado} valor={iva.valor}
            nota={iva.nota} detalle={`IVA ventas ${formatCLP(data.iva.debito)} − IVA compras ${formatCLP(data.iva.credito)}`} />
        </>)}
      </div>
      {data && <p className="mt-2 text-xs text-ink-faint">Es una proyección calculada con lo registrado hasta hoy; no reemplaza la declaración F29. <Link to="/erp/cobranzas" className="font-medium text-brand hover:underline">Ver cobranzas</Link></p>}
    </section>
  )
}
