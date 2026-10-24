import { Link } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Badge, Mono, cn } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { formatFechaHora, formatPct } from '@/domain/format'

const COLOR_REAL = { SOBRECOSTO: 'bg-crit', EN_RANGO: 'bg-brand', BAJO_PRESUPUESTO: 'bg-brand' }
const TONO_DESVIO = { SOBRECOSTO: 'crit', EN_RANGO: 'ok', BAJO_PRESUPUESTO: 'info' }
const LABEL_DESVIO = { SOBRECOSTO: 'Sobrecosto', EN_RANGO: 'En rango', BAJO_PRESUPUESTO: 'Bajo presupuesto' }

/** Barras pareadas presupuestado (gris) vs. real (azul; rojo si hay sobrecosto), con valores directos. */
export function BarrasPareadas({ items }) {
  const max = Math.max(1, ...items.flatMap((i) => [i.presupuestado, i.real]))
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />Presupuestado</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Real</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-crit" />Real con sobrecosto</span>
      </div>
      <ul className="space-y-4">
        {items.map((o) => (
          <li key={o.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <Link to={`/erp/obras/${o.id}`} className="min-w-0 truncate font-medium hover:text-brand"><Mono className="mr-1.5 text-xs text-ink-soft">{o.id}</Mono>{o.nombre}</Link>
              <span className="flex shrink-0 items-center gap-2"><Mono className="text-xs">{formatPct(o.desvioPct)}</Mono><Badge tone={TONO_DESVIO[o.estadoDesvio]}>{LABEL_DESVIO[o.estadoDesvio]}</Badge></span>
            </div>
            {[['Presupuestado', o.presupuestado, 'bg-slate-300'], ['Real', o.real, COLOR_REAL[o.estadoDesvio]]].map(([etiqueta, valor, color]) => (
              <div key={etiqueta} className="flex items-center gap-2" role="img" aria-label={`${etiqueta} ${o.nombre}: ${valor} pesos`}>
                <div className="h-3 flex-1 rounded-sm bg-slate-50"><div className={cn('h-full rounded-sm', color)} style={{ width: `${(valor / max) * 100}%` }} /></div>
                <MoneyCell value={valor} className="w-24 text-right text-xs" />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

const SEV = {
  CRITICA: { icon: AlertCircle, color: 'text-crit', bg: 'bg-crit-bg' },
  ADVERTENCIA: { icon: AlertTriangle, color: 'text-warn', bg: 'bg-warn-bg' },
  INFO: { icon: Info, color: 'text-brand', bg: 'bg-brand-tint' },
}

export function ListaAlertas({ alertas, limite, columnas = false }) {
  const visibles = limite ? alertas.slice(0, limite) : alertas
  return (
    <ul className={columnas ? 'grid gap-x-8 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-1' : 'divide-y divide-line'}>
      {visibles.map((a) => {
        const { icon: Icono, color, bg } = SEV[a.severidad]
        const cuerpo = (
          <div className="flex items-start gap-3 px-1 py-2.5">
            <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', bg)}><Icono className={cn('h-3.5 w-3.5', color)} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.titulo}</p><p className="truncate text-xs text-ink-soft">{a.detalle}</p></div>
          </div>
        )
        return <li key={a.id} className={columnas ? 'min-w-0 border-b border-line' : 'min-w-0'}>{a.ruta ? <Link to={a.ruta} className="block rounded-lg hover:bg-slate-50">{cuerpo}</Link> : cuerpo}</li>
      })}
    </ul>
  )
}

export function ActividadReciente({ logs }) {
  return (
    <ul className="divide-y divide-line">
      {logs.map((l) => (
        <li key={l.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0"><p className="truncate"><span className="font-medium">{l.usuario_nombre}</span> <Badge tone="neutral">{l.accion}</Badge></p><p className="truncate text-xs text-ink-soft">{l.entidad} <Mono>{l.entidad_id}</Mono></p></div>
          <Mono className="shrink-0 text-[11px] text-ink-faint">{formatFechaHora(l.fecha)}</Mono>
        </li>
      ))}
    </ul>
  )
}
