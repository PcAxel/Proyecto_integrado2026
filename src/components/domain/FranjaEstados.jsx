import { cn } from '@/components/ui'

const COLOR = { info: 'bg-brand', ok: 'bg-ok', warn: 'bg-harvest', crit: 'bg-crit', neutral: 'bg-slate-400' }

/**
 * Franja de estados: cuenta cada estado y, al elegirlo, filtra la lista de abajo. Una barra proporcional
 * muestra de un vistazo cómo se reparte el total. Reemplaza a una fila de tarjetas de indicadores iguales.
 *
 * @param {{segmentos: Array<{id:string, label:string, valor:number, tono?:keyof typeof COLOR}>, activo:string, onElegir:(id:string)=>void, nota?: import('react').ReactNode, cargando?: boolean}} props
 *   El segmento con id '' es «Todos».
 */
export function FranjaEstados({ segmentos, activo, onElegir, nota, cargando }) {
  const propios = segmentos.filter((s) => s.id !== '')
  const total = propios.reduce((a, s) => a + s.valor, 0)
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-stretch" role="group" aria-label="Filtrar por estado">
        {segmentos.map((s) => {
          const sel = s.id === activo
          return (
            <button
              key={s.id || 'todos'}
              type="button"
              aria-pressed={sel}
              onClick={() => onElegir(s.id)}
              className={cn(
                'group relative flex min-w-[7.5rem] flex-1 flex-col items-start px-5 py-4 text-left transition-colors duration-150',
                sel ? 'bg-brand-tint/70' : 'hover:bg-slate-50',
              )}
            >
              {sel && <span className="absolute inset-x-0 top-0 h-[3px] bg-brand" aria-hidden="true" />}
              <span className={cn('t-display text-[2rem] leading-none tabular-nums', sel ? 'text-brand-dark' : 'text-ink')}>{cargando ? '–' : s.valor}</span>
              <span className={cn('mt-1.5 flex items-center gap-1.5 text-[13px] font-medium', sel ? 'text-ink' : 'text-ink-soft')}>
                {s.id !== '' && <span className={cn('h-2 w-2 rounded-full', COLOR[s.tono ?? 'neutral'])} aria-hidden="true" />}
                {s.label}
              </span>
            </button>
          )
        })}
        {nota && <div className="flex min-w-[12rem] flex-1 items-center border-l border-line bg-harvest-bg/50 px-5 py-4">{nota}</div>}
      </div>
      <div className="flex h-1.5 bg-slate-100" aria-hidden="true">
        {propios.map((s) => (
          <span key={s.id} className={cn('transition-[width] duration-500', COLOR[s.tono ?? 'neutral'], s.id === activo || activo === '' ? 'opacity-100' : 'opacity-30')} style={{ width: total ? `${(s.valor / total) * 100}%` : 0 }} />
        ))}
      </div>
    </div>
  )
}
