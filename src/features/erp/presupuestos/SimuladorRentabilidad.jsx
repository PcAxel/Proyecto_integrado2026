import { AlertTriangle, ShieldAlert, Wand2 } from 'lucide-react'
import { Mono, Button } from '@/components/ui'
import { MoneyCell, MarginGauge } from '@/components/domain'
import { formatCLP } from '@/domain/money'
import { MARGEN_MINIMO, MARGEN_OBJETIVO } from '@/domain/rentabilidad'

const SEM_LABEL = { ROJO: 'Margen crítico', AMBAR: 'Margen aceptable', VERDE: 'Margen saludable' }
const SEM_COLOR = { ROJO: 'text-crit', AMBAR: 'text-warn', VERDE: 'text-ok' }

function Fila({ label, value, fuerte, tono }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${fuerte ? 'font-semibold' : 'text-ink-soft'}`}>
      <span>{label}</span><MoneyCell value={value} className={tono} />
    </div>
  )
}

/**
 * Panel de rentabilidad previa (RF05). Presentacional: recibe el resultado de simularRentabilidad().
 * @param {{sim: ReturnType<typeof import('@/domain/rentabilidad').simularRentabilidad>, aprobacion?: {ok:boolean, motivo?:string}, onAplicarSugerido?: ()=>void, editable?: boolean, children?: any}} props
 */
export function SimuladorRentabilidad({ sim, aprobacion, onAplicarSugerido, editable = true, children }) {
  const conVenta = sim.ventaNeto > 0
  return (
    <aside className="card xl:sticky xl:top-6" aria-label="Simulador de rentabilidad">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">Simulador de rentabilidad</h2>
        {conVenta && <span className={`text-xs font-medium ${SEM_COLOR[sim.semaforo]}`}>{SEM_LABEL[sim.semaforo]}</span>}
      </header>

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

        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-ink-soft">Margen</span>
            <MoneyCell value={sim.margenMonto} className={`font-semibold ${conVenta ? SEM_COLOR[sim.semaforo] : ''}`} />
          </div>
          <MarginGauge pct={sim.margenPct} />
          <div className="mt-1 flex justify-between text-[10px] text-ink-faint"><span>0 %</span><span>mín. 20 %</span><span>30 %</span><span>50 %</span></div>
        </div>

        {aprobacion && !aprobacion.ok && aprobacion.motivo && (
          <p className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-xs text-warn">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{aprobacion.motivo}
          </p>
        )}
      </div>
      {children && <footer className="space-y-2 border-t border-line p-5">{children}</footer>}
    </aside>
  )
}
