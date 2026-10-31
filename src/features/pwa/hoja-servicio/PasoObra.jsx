import { HardHat, MapPin, CheckCircle2 } from 'lucide-react'
import { Skeleton, EmptyState, Mono, cn } from '@/components/ui'
import { TIPO_OBRA_LABEL } from '@/components/domain'

export function PasoObra({ obras, draft, setDraft }) {
  if (!obras) return <div className="card"><Skeleton rows={4} /></div>
  if (obras.length === 0) return <div className="card"><EmptyState icon={HardHat} title="Sin obras en curso" hint="No tienes obras asignadas que estén en curso." /></div>
  return (
    <div className="space-y-3">
      <p className="text-base text-ink-soft">¿En qué obra trabajaste?</p>
      {obras.map((o) => {
        const activa = draft.obra_id === o.id
        return (
          <button key={o.id} type="button" onClick={() => setDraft({ ...draft, obra_id: o.id })}
            className={cn('card flex min-h-[4.5rem] w-full items-center gap-3 p-4 text-left transition-colors', activa && 'border-brand bg-brand-tint')}>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{o.nombre}</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3 w-3" />{o.ubicacion.comuna} · {TIPO_OBRA_LABEL[o.tipo]}</p>
              <Mono className="text-sm text-ink-faint">{o.id}</Mono>
            </div>
            {activa && <CheckCircle2 className="h-6 w-6 shrink-0 text-brand" />}
          </button>
        )
      })}
    </div>
  )
}
