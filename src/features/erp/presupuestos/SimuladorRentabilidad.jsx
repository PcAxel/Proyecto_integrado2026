import { AlertTriangle, ShieldAlert, Wand2 } from 'lucide-react'
import { Mono, Button, cn } from '@/components/ui'
import { MoneyCell, Manometro } from '@/components/domain'
import { formatCLP } from '@/domain/money'
import { formatPct } from '@/domain/format'
import { MARGEN_MINIMO, MARGEN_OBJETIVO } from '@/domain/rentabilidad'

const SEM_LABEL = { ROJO: 'Margen crítico', AMBAR: 'Margen aceptable', VERDE: 'Margen saludable' }
const SEM_COLOR = { ROJO: 'text-[#FF8F86]', AMBAR: 'text-harvest', VERDE: 'text-[#59D69C]' }
const BANDAS = [{ hasta: MARGEN_MINIMO, tono: 'crit' }, { hasta: 30, tono: 'warn' }, { hasta: 50, tono: 'ok' }]

function Fila({ label, value, fuerte, tono }) {
  return (
    <div className={cn('flex items-baseline justify-between py-1 text-sm', fuerte ? 'font-semibold text-ink' : 'text-ink-soft')}>
      <span>{label}</span><MoneyCell value={value} className={tono} />
    </div>
  )
}

/**
 * Simulador de rentabilidad previa (RF05). Presentacional: recibe el resultado de simularRentabilidad().
 * El manómetro lee el margen mientras se edita el presupuesto.
 */
export function SimuladorRentabilidad({ sim, aprobacion, onAplicarSugerido, editable = true, children }) {
  const conVenta = sim.ventaNeto > 0
  return (
    <aside className="card overflow-hidden xl:sticky xl:top-6" aria-label="Simulador de rentabilidad">
      <div className="instrument rounded-none px-5 pb-3 pt-4">
        <div className="lattice pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="t-display text-xl">Simulador de rentabilidad</h2>
            {conVenta && <span className={cn('text-xs font-semibold', SEM_COLOR[sim.semaforo])}>{SEM_LABEL[sim.semaforo]}</span>}
          </div>
          <Manometro valor={conVenta ? sim.margenPct : 0} max={50} bandas={BANDAS} texto={conVenta ? formatPct(sim.margenPct) : '—'} etiqueta={conVenta ? `Margen de ${formatCLP(sim.margenMonto)}` : 'Ingresa un precio de venta'} className="mx-auto max-w-[17rem]" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        {sim.bajoMinimo && conVenta && (
          <div role="alert" className="rounded-lg border border-crit/30 bg-crit-bg p-3 text-sm text-crit">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Margen bajo el mínimo de {MARGEN_MINIMO} %</p>
            <p className="mt-1 text-xs">
              Precio sugerido para {MARGEN_OBJETIVO} % de margen: <Mono className="font-semibold">{formatCLP(sim.precioSugerido)}</Mono>
            </p>
            {editable && onAplicarSugerido && (
              <Button size="sm" variant="danger" className="mt-2" icon={Wand2} onClick={onAplicarSugerido}>Aplicar precio sugerido</Button>
            )}
          </div>
        )}

        <div>
          <Fila label="Materiales" value={sim.costoMateriales} />
          <Fila label="Mano de obra (hora-hombre)" value={sim.costoManoObra} />
          <Fila label="Adicionales" value={sim.costoAdicionales} />
          <div className="my-1 border-t border-line" />
          <Fila label="Costo total" value={sim.costoTotal} fuerte />
        </div>

        <div>
          <Fila label="Venta neta" value={sim.ventaNeto} fuerte />
          <Fila label="IVA 19 %" value={sim.iva} />
          <Fila label="Total con IVA" value={sim.ventaTotal} fuerte />
        </div>

        {aprobacion && !aprobacion.ok && aprobacion.motivo && (
          <p className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-xs text-warn">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{aprobacion.motivo}
          </p>
        )}
      </div>
      {children && <footer className="space-y-2 border-t border-line bg-slate-50/70 p-5">{children}</footer>}
    </aside>
  )
}
