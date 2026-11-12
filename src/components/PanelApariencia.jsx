import { useEffect, useRef, useState } from 'react'
import { Moon, RotateCcw, Sun } from 'lucide-react'
import { cn } from '@/components/ui'
import { ESCALA, PALETAS, esNoche } from '@/domain/temas'
import { useTemaStore } from '@/stores/temaStore'

const rgb = (t) => `rgb(${t})`

/** Muestra de una paleta: fondo, superficie y color de marca, para elegir sin adivinar. */
function Muestra({ paleta, activa, onClick }) {
  const t = paleta.tokens
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activa} aria-label={`Paleta ${paleta.nombre}`}
      className={cn('flex flex-1 flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 text-xs font-medium text-ink-soft transition-colors', activa ? 'border-brand text-ink' : 'border-line hover:border-line-strong')}
    >
      <span className="flex h-9 w-full overflow-hidden rounded-md border border-black/10" aria-hidden="true">
        <span className="w-1/2" style={{ background: rgb(t.canvas) }} />
        <span className="flex w-1/2 flex-col"><span className="h-1/2" style={{ background: rgb(t.surface) }} /><span className="h-1/2" style={{ background: rgb(t.brand) }} /></span>
      </span>
      {paleta.nombre}
    </button>
  )
}

const Barra = ({ id, etiqueta, valor, min, max, paso, onChange, texto, izq, der }) => (
  <div>
    <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor={id} className="text-sm font-semibold text-ink">{etiqueta}</label><span className="text-xs tabular-nums text-ink-soft">{texto}</span></div>
    <div className="flex items-center gap-2 text-ink-soft">
      {izq}
      <input id={id} type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="h-6 min-w-0 flex-1 cursor-pointer accent-brand" />
      {der}
    </div>
  </div>
)

/**
 * Botón de sol/luna que abre el panel de apariencia: barra día↔noche, paletas claras y oscuras y tamaño de letra.
 * Sirve igual en el ERP y en la app de terreno; todo se guarda por persona.
 * @param {{nivelDefecto?: number, grande?: boolean, alineado?: 'derecha'|'izquierda'}} props
 */
export function PanelApariencia({ nivelDefecto = 100, grande = false, alineado = 'derecha' }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  const { nivel, claro, oscuro, escala, setNivel, setPaleta, setEscala, restablecer } = useTemaStore()
  const noche = esNoche(nivel)

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const textoNivel = nivel === 0 ? 'Día' : nivel === 100 ? 'Noche' : `${nivel} % noche`
  return (
    <div ref={raiz} className="relative">
      <button
        type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog" aria-label="Apariencia: modo día o noche, colores y tamaño de letra" title="Apariencia"
        className={cn('flex items-center justify-center border text-fyag-ice transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream',
          grande ? 'h-12 w-12 rounded-xl border-2 border-line-strong text-ink' : 'h-8 w-8 rounded-md border-fyag-ice/15')}
      >
        {noche ? <Moon className={grande ? 'h-5 w-5' : 'h-4 w-4'} /> : <Sun className={grande ? 'h-5 w-5' : 'h-4 w-4'} />}
      </button>
      {abierto && (
        <div role="dialog" aria-label="Apariencia"
          className={cn('absolute top-full z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] space-y-4 rounded-xl border border-line bg-surface p-4 text-ink shadow-pop', alineado === 'derecha' ? 'right-0' : 'left-0')}>
          <Barra id="ap-nivel" etiqueta="Día ↔ Noche" valor={nivel} min={0} max={100} paso={1} onChange={setNivel} texto={textoNivel}
            izq={<Sun className="h-4 w-4 shrink-0" aria-hidden="true" />} der={<Moon className="h-4 w-4 shrink-0" aria-hidden="true" />} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Colores</p>
            <div><p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Claras</p>
              <div className="flex gap-2">{Object.entries(PALETAS.claro).map(([id, p]) => <Muestra key={id} paleta={p} activa={claro === id} onClick={() => setPaleta('claro', id)} />)}</div></div>
            <div><p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Oscuras</p>
              <div className="flex gap-2">{Object.entries(PALETAS.oscuro).map(([id, p]) => <Muestra key={id} paleta={p} activa={oscuro === id} onClick={() => setPaleta('oscuro', id)} />)}</div></div>
            <p className="text-[11px] leading-snug text-ink-faint">La barra mezcla la paleta clara con la oscura que elijas.</p>
          </div>
          <Barra id="ap-letra" etiqueta="Tamaño de letra" valor={escala} min={ESCALA.min} max={ESCALA.max} paso={ESCALA.paso} onChange={setEscala} texto={`${escala} %`}
            izq={<span className="text-xs font-semibold" aria-hidden="true">A</span>} der={<span className="text-xl font-semibold leading-none" aria-hidden="true">A</span>} />
          <button type="button" onClick={() => restablecer(nivelDefecto)} className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark"><RotateCcw className="h-3.5 w-3.5" />Restablecer</button>
        </div>
      )}
    </div>
  )
}
