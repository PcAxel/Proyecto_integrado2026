import { CHECKLIST_SCHEMA, evaluarChecklist, rangoLegible, valorLegible } from '@/domain/checklist'
import { Badge, Mono } from '@/components/ui'

const TONO = { OK: 'ok', ALERTA: 'warn', CRITICO: 'crit', FALTANTE: 'neutral' }
const TEXTO = { OK: 'Conforme', ALERTA: 'Alerta', CRITICO: 'Crítico', FALTANTE: 'Sin dato' }

/** Vista de solo lectura del checklist paramétrico (los 5 puntos) con su evaluación. */
export function ChecklistGrid({ valores }) {
  const { items } = evaluarChecklist(valores)
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-line text-left text-xs text-ink-soft"><th className="py-2 font-medium">Punto</th><th className="py-2 font-medium">Medición</th><th className="py-2 font-medium">Esperado</th><th className="py-2 text-right font-medium">Evaluación</th></tr></thead>
      <tbody>
        {items.map((it) => {
          const def = CHECKLIST_SCHEMA.find((d) => d.id === it.id)
          return (
            <tr key={it.id} className="border-b border-line last:border-0">
              <td className="py-2.5 font-medium">{def.label}</td>
              <td className="py-2.5"><Mono>{valorLegible(def, it.valor)}</Mono></td>
              <td className="py-2.5 text-xs text-ink-soft">{def.tipo === 'numero' ? <Mono>{rangoLegible(def)}</Mono> : def.opciones[0].label}</td>
              <td className="py-2.5 text-right"><Badge tone={TONO[it.estado]}>{TEXTO[it.estado]}</Badge></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
