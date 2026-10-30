import { Skeleton } from '@/components/ui'

/**
 * Selector de técnicos asignados a una obra. Solo los asignados ven la obra en su app de terreno.
 * @param {{tecnicos?: Array<{id:string,nombre:string,cargo:string}>, value: string[], onChange:(ids:string[])=>void, compacto?: boolean}} props
 */
export function SelectorTecnicos({ tecnicos, value, onChange, compacto = false }) {
  const alternar = (id) => onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id])
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-ink-soft">Técnicos asignados ({value.length})</legend>
      {!tecnicos ? <Skeleton rows={3} /> : (
        <div className={compacto ? 'grid gap-1' : 'grid gap-1 sm:grid-cols-2'}>
          {tecnicos.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={value.includes(t.id)} onChange={() => alternar(t.id)} />
              <span>{t.nombre}</span><span className="text-xs text-ink-faint">{t.cargo}</span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-faint">Cada técnico verá en su app solo las obras en las que está asignado.</p>
    </fieldset>
  )
}
