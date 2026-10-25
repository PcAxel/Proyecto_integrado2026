import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { Textarea, SignaturePad, Button, Mono } from '@/components/ui'
import { ChecklistResultBadge } from '@/components/domain'
import { evaluarChecklist } from '@/domain/checklist'
import { dentroDeGeocerca } from '@/domain/geo'
import { PASOS_HOJA, validarPasoHoja } from '@/domain/hojas'
import { validarKilometraje, formatKm } from '@/domain/flota'

export function PasoCierre({ obra, draft, setDraft, lineas, irAPaso, vehiculos = [] }) {
  const { resultado } = evaluarChecklist(draft.checklist)
  const fuera = draft.fotos.filter((f) => !dentroDeGeocerca(f, obra.ubicacion, obra.ubicacion.radio_m).dentro).length
  const vehiculo = vehiculos.find((v) => v.id === draft.vehiculo_id)
  const km = validarKilometraje(draft)
  const pendientes = [0, 1, 2, 3].filter((i) => !validarPasoHoja(i, draft).ok)

  return (
    <div className="space-y-5">
      <section className="card divide-y divide-line text-sm">
        <Fila k="Obra" v={obra.nombre} />
        <Fila k="Checklist" v={<ChecklistResultBadge resultado={resultado} />} />
        <Fila k="Fotos" v={<Mono>{draft.fotos.length}</Mono>} />
        <Fila k="Horas" v={<Mono>{draft.horas_trabajadas ?? 0} h</Mono>} />
        <Fila k="Vehículo" v={vehiculo ? <span className="flex items-center gap-2"><Mono>{vehiculo.patente}</Mono>{km.recorrido && <Mono className="text-ink-soft">· {formatKm(km.recorrido)}</Mono>}</span> : <span className="text-ink-faint">Sin vehículo</span>} />
        <Fila k="Materiales usados" v={<Mono>{lineas.length}</Mono>} />
      </section>

      {fuera > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-xs text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{fuera} foto(s) fuera de la geocerca. El supervisor lo verá en la auditoría.</p>
      )}
      {pendientes.length > 0 && (
        <div className="rounded-lg bg-crit-bg p-3 text-xs text-crit">
          <p className="font-semibold">Falta completar:</p>
          <div className="mt-2 flex flex-wrap gap-2">{pendientes.map((i) => <Button key={i} type="button" size="sm" variant="secondary" onClick={() => irAPaso(i)}>{PASOS_HOJA[i]}</Button>)}</div>
        </div>
      )}

      <Textarea label="Observaciones (opcional)" value={draft.observaciones} onChange={(e) => setDraft({ ...draft, observaciones: e.target.value })} />
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">Firma del cliente {draft.firma && <CheckCircle2 className="h-4 w-4 text-ok" />}</p>
        <SignaturePad value={draft.firma} onChange={(f) => setDraft({ ...draft, firma: f })} />
      </div>
    </div>
  )
}

const Fila = ({ k, v }) => <div className="flex items-center justify-between px-4 py-3"><span className="text-ink-soft">{k}</span><span className="font-medium">{v}</span></div>
