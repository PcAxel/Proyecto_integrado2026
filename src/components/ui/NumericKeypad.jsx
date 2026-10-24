import { Delete } from 'lucide-react'
import { aplicarTecla } from '@/domain/teclado'
import { cn } from './cn'

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '±', '0', '.']

/**
 * Teclado numérico grande para terreno (teclas de 56 px, usable con guantes).
 * `value` es texto; entrega el texto nuevo en onChange.
 * @param {{value:string, onChange:(v:string)=>void, permitirNegativo?:boolean}} props
 */
export function NumericKeypad({ value, onChange, permitirNegativo = true }) {
  const pulsar = (t) => onChange(aplicarTecla(value, t))
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado numérico">
      {TECLAS.map((t) => (
        <button key={t} type="button" onClick={() => pulsar(t)} disabled={t === '±' && !permitirNegativo}
          className={cn('h-14 rounded-xl border border-line bg-surface font-mono text-xl font-semibold active:bg-brand-tint disabled:opacity-30', t === '±' && 'text-ink-soft')}>
          {t}
        </button>
      ))}
      <button type="button" onClick={() => onChange(value.slice(0, -1))} aria-label="Borrar"
        className="col-span-3 flex h-14 items-center justify-center gap-2 rounded-xl border border-line bg-slate-50 text-sm font-medium text-ink-soft active:bg-slate-100">
        <Delete className="h-5 w-5" />Borrar
      </button>
    </div>
  )
}
