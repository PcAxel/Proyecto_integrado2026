import { Plus, Minus, Truck } from 'lucide-react'
import { Button, Mono, Select, NumberField, cn } from '@/components/ui'
import { HORAS_MAX_DIA } from '@/domain/hojas'
import { validarKilometraje, formatKm } from '@/domain/flota'
import { MaterialPicker } from '../MaterialPicker'

const RAPIDAS = [2, 4, 6, 8]

/** Paso 4: horas trabajadas, vehículo con su kilometraje de salida y regreso, y materiales usados. */
export function PasoHoras({ draft, setDraft, catalogo, lineas, setLineas, vehiculos }) {
  const horas = draft.horas_trabajadas ?? 0
  const set = (h) => setDraft({ ...draft, horas_trabajadas: Math.min(HORAS_MAX_DIA, Math.max(0, h)) })

  const vehiculo = vehiculos.find((v) => v.id === draft.vehiculo_id)
  const ambosKm = Number.isFinite(draft.km_salida) && Number.isFinite(draft.km_regreso)
  // El error solo aparece cuando ya hay dos números que se contradicen; los vacíos los avisa el botón «Siguiente».
  const km = ambosKm ? validarKilometraje(draft) : { ok: true }
  const salidaBajoOdometro = vehiculo && Number.isFinite(draft.km_salida) && draft.km_salida < vehiculo.km_actual

  const elegirVehiculo = (id) => {
    const v = vehiculos.find((x) => x.id === id)
    // Se sugiere el odómetro registrado como kilometraje de salida (editable).
    setDraft({ ...draft, vehiculo_id: id, km_salida: v ? v.km_actual : null, km_regreso: null })
  }

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
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-ink-soft" />Vehículo <span className="font-normal text-ink-soft">(si usaste uno)</span></h2>
        <p className="mb-3 text-xs text-ink-soft">Registra el odómetro al salir y al volver. El kilometraje queda asociado a esta hoja.</p>
        <div className="space-y-3">
          <Select
            size="lg"
            mono
            label="Patente"
            placeholder="No usé vehículo"
            value={draft.vehiculo_id ?? ''}
            onChange={(e) => elegirVehiculo(e.target.value)}
            options={vehiculos.map((v) => ({ value: v.id, label: `${v.patente} · ${v.marca} ${v.modelo}` }))}
          />
          {vehiculo && (
            <>
              <p className="text-xs text-ink-soft">{vehiculo.asignado && <span className="mr-2 rounded-full bg-brand-tint px-2 py-0.5 font-medium text-brand">Asignado a ti</span>}Odómetro registrado: <Mono className="font-medium text-ink">{formatKm(vehiculo.km_actual)}</Mono></p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  size="lg"
                  label="Kilometraje de salida"
                  suffix="km"
                  min={0}
                  value={draft.km_salida}
                  onChange={(v) => setDraft({ ...draft, km_salida: v })}
                  hint={salidaBajoOdometro ? 'Menor al odómetro registrado' : undefined}
                />
                <NumberField
                  size="lg"
                  label="Kilometraje de regreso"
                  suffix="km"
                  min={0}
                  value={draft.km_regreso}
                  onChange={(v) => setDraft({ ...draft, km_regreso: v })}
                  error={km.ok ? undefined : km.error}
                />
              </div>
              {km.ok && km.recorrido && (
                <p className="rounded-lg bg-ok-bg p-3 text-sm text-ok">Recorrido del día: <Mono className="font-semibold">{formatKm(km.recorrido)}</Mono></p>
              )}
            </>
          )}
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
