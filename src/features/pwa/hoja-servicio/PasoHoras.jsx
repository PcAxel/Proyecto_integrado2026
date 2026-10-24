import { Plus, Minus } from 'lucide-react'
import { Button, Mono, cn } from '@/components/ui'
import { HORAS_MAX_DIA } from '@/domain/hojas'
import { MaterialPicker } from '../MaterialPicker'

const RAPIDAS = [2, 4, 6, 8]

export function PasoHoras({ draft, setDraft, catalogo, lineas, setLineas }) {
  const horas = draft.horas_trabajadas ?? 0
  const set = (h) => setDraft({ ...draft, horas_trabajadas: Math.min(HORAS_MAX_DIA, Math.max(0, h)) })
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Horas trabajadas</h2>
        <div className="card flex items-center justify-between p-3">
          <Button type="button" variant="secondary" size="lg" className="w-16" icon={Minus} aria-label="Menos media hora" onClick={() => set(horas - 0.5)} />
          <div className="text-center"><Mono className="text-4xl font-bold">{horas}</Mono><p className="text-xs text-ink-soft">horas</p></div>
          <Button type="button" variant="secondary" size="lg" className="w-16" icon={Plus} aria-label="Más media hora" onClick={() => set(horas + 0.5)} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {RAPIDAS.map((h) => (
            <button key={h} type="button" onClick={() => set(h)} className={cn('h-14 rounded-xl border-2 font-mono text-lg font-semibold', horas === h ? 'border-brand bg-brand-tint text-brand' : 'border-line bg-surface')}>{h} h</button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-sm font-semibold">Materiales usados <span className="font-normal text-ink-soft">(opcional)</span></h2>
        <p className="mb-3 text-xs text-ink-soft">Registro informativo de lo consumido. El descuento de bodega se hace con la solicitud de retiro.</p>
        <MaterialPicker catalogo={catalogo} lineas={lineas} onChange={setLineas} vacio="Si no usaste materiales, continúa." />
      </section>
    </div>
  )
}
