import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button, NumericKeypad, Mono, cn } from '@/components/ui'
import { CHECKLIST_SCHEMA, evaluarChecklist, rangoLegible, valorLegible } from '@/domain/checklist'
import { aNumero } from '@/domain/teclado'

const COLOR = { OK: 'border-ok bg-ok-bg', ALERTA: 'border-warn bg-warn-bg', CRITICO: 'border-crit bg-crit-bg', FALTANTE: 'border-line bg-surface' }
const TEXTO = { OK: 'text-ok', ALERTA: 'text-warn', CRITICO: 'text-crit', FALTANTE: 'text-ink-faint' }

/** Editor numérico de un punto: teclado grande y evaluación en vivo. */
function EditorNumero({ def, valor, onChange }) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? '' : String(valor))
  const estado = evaluarChecklist({ [def.id]: aNumero(texto) }).items.find((i) => i.id === def.id).estado
  return (
    <div className="space-y-3">
      <div className={cn('flex items-baseline justify-between rounded-xl border-2 px-4 py-3', COLOR[estado])}>
        <Mono className="text-4xl font-bold">{texto || '0'}</Mono>
        <span className="text-lg font-semibold text-ink-soft">{def.unidad}</span>
      </div>
      <p className="text-sm text-ink-soft">Rango esperado: <Mono>{rangoLegible(def)}</Mono></p>
      <NumericKeypad value={texto} onChange={(t) => { setTexto(t); onChange(aNumero(t)) }} />
    </div>
  )
}

function EditorOpcion({ def, valor, onChange }) {
  return (
    <div className="grid gap-2">
      {def.opciones.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('flex h-14 items-center justify-between rounded-xl border-2 px-4 text-base font-semibold', valor === o.value ? COLOR[o.estado] : 'border-line bg-surface')}>
          {o.label}{valor === o.value && <Check className="h-5 w-5" />}
        </button>
      ))}
    </div>
  )
}

export function PasoChecklist({ draft, setDraft }) {
  const { items } = evaluarChecklist(draft.checklist)
  const [activo, setActivo] = useState(() => Math.max(0, items.findIndex((i) => i.estado === 'FALTANTE')))
  const setValor = (id, v) => setDraft({ ...draft, checklist: { ...draft.checklist, [id]: v } })
  const siguiente = () => {
    const prox = items.findIndex((i, idx) => idx > activo && i.estado === 'FALTANTE')
    setActivo(prox === -1 ? -1 : prox)
  }

  return (
    <div className="space-y-2">
      {CHECKLIST_SCHEMA.map((def, idx) => {
        const it = items[idx]
        const abierto = activo === idx
        return (
          <div key={def.id} className={cn('card overflow-hidden border-2', COLOR[it.estado])}>
            <button type="button" onClick={() => setActivo(abierto ? -1 : idx)} className="flex min-h-14 w-full items-center justify-between px-4 text-left" aria-expanded={abierto}>
              <span className="text-base font-semibold">{idx + 1}. {def.label}</span>
              <Mono className={cn('text-base font-semibold', TEXTO[it.estado])}>{valorLegible(def, it.valor)}</Mono>
            </button>
            {abierto && (
              <div className="space-y-3 border-t border-line bg-surface p-4">
                {def.tipo === 'numero'
                  ? <EditorNumero key={def.id} def={def} valor={draft.checklist[def.id]} onChange={(v) => setValor(def.id, v)} />
                  : <EditorOpcion def={def} valor={draft.checklist[def.id]} onChange={(v) => setValor(def.id, v)} />}
                <Button type="button" size="lg" className="w-full" disabled={it.estado === 'FALTANTE'} onClick={siguiente}>Listo</Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
