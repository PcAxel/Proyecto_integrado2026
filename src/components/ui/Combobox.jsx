import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsUpDown, X } from 'lucide-react'
import { filtrarOpciones, prepararOpciones } from '@/domain/combobox'
import { inputBase, TextoEtiqueta } from './Field'
import { cn } from './cn'

/**
 * Selector con escritura (typeahead) para catálogos grandes: se escribe el SKU o parte del nombre y la lista se filtra al instante.
 * Solo dibuja las primeras `max` coincidencias (puede haber miles de opciones) y avisa cuántas más hay. Teclado: ↑ ↓ Enter Esc.
 * La lista va en un portal para que no la corte el scroll de un modal.
 * @param {{label?:string, options:Array<{value:string,label:string,detail?:string}>, value:string, onChange:(valor:string)=>void, placeholder?:string,
 *   hint?:string, error?:string, disabled?:boolean, max?:number, className?:string, 'aria-label'?:string, autoFocus?:boolean}} props
 */
export function Combobox({ label, options, value, onChange, placeholder = 'Escribe para buscar…', hint, error, disabled, max = 50, className, autoFocus, obligatorio, opcional, ...rest }) {
  const id = useId()
  const lista = `${id}-lista`
  const raiz = useRef(null)
  const entrada = useRef(null)
  const [consulta, setConsulta] = useState('')
  const [editando, setEditando] = useState(false) // true mientras se escribe: muestra lo escrito en vez del elegido
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [caja, setCaja] = useState(null)

  const preparadas = useMemo(() => prepararOpciones(options), [options])
  const elegida = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])
  const { items, total } = useMemo(() => filtrarOpciones(preparadas, editando ? consulta : '', max), [preparadas, consulta, editando, max])

  // Posición de la lista bajo la entrada (se recalcula al abrir, al hacer scroll y al cambiar el tamaño).
  useLayoutEffect(() => {
    if (!abierto) return undefined
    const poner = () => { const r = entrada.current?.getBoundingClientRect(); if (r) setCaja({ left: r.left, top: r.bottom + 4, width: r.width, arriba: r.top }) }
    poner()
    window.addEventListener('resize', poner)
    window.addEventListener('scroll', poner, true)
    return () => { window.removeEventListener('resize', poner); window.removeEventListener('scroll', poner, true) }
  }, [abierto, items.length])

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (!raiz.current?.contains(e.target) && !document.getElementById(lista)?.contains(e.target)) cerrar() }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, lista]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActivo(0) }, [consulta, abierto])

  const cerrar = () => { setAbierto(false); setEditando(false); setConsulta('') }
  const elegir = (o) => { onChange(o.value); cerrar(); entrada.current?.blur() }
  const limpiar = () => { onChange(''); setConsulta(''); setEditando(true); setAbierto(true); entrada.current?.focus() }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && abierto && items[activo]) { e.preventDefault(); elegir(items[activo]) }
    else if (e.key === 'Escape' && abierto) { e.stopPropagation(); cerrar() }
  }

  const visible = editando ? consulta : elegida?.label ?? ''
  const abreHaciaArriba = caja && typeof window !== 'undefined' && window.innerHeight - caja.top < 260 && caja.arriba > 260

  return (
    <div className={cn('block', className)} ref={raiz}>
      {label && <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink"><TextoEtiqueta texto={label} obligatorio={obligatorio} opcional={opcional} /></label>}
      <div className="relative">
        <input
          ref={entrada} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false} disabled={disabled} autoFocus={autoFocus}
          aria-expanded={abierto} aria-controls={lista} aria-autocomplete="list" aria-activedescendant={abierto && items[activo] ? `${id}-op-${activo}` : undefined}
          aria-invalid={error ? true : undefined}
          value={visible} placeholder={placeholder}
          onFocus={(e) => { setAbierto(true); e.target.select() }}
          onChange={(e) => { setConsulta(e.target.value); setEditando(true); setAbierto(true) }}
          onKeyDown={onKeyDown}
          className={cn(inputBase, 'h-10 pr-16', error && 'border-crit')}
          {...rest}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-ink-faint">
          {elegida && !disabled && (
            <button type="button" tabIndex={-1} aria-label="Quitar selección" onMouseDown={(e) => e.preventDefault()} onClick={limpiar} className="pointer-events-auto rounded p-1 hover:bg-slate-100 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      {error ? <span className="mt-1.5 block text-xs font-medium text-crit">{error}</span> : hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>}

      {abierto && caja && createPortal(
        <ul
          id={lista} role="listbox" aria-label={label ?? rest['aria-label'] ?? 'Opciones'}
          style={{ position: 'fixed', left: caja.left, width: caja.width, ...(abreHaciaArriba ? { bottom: window.innerHeight - caja.arriba + 4 } : { top: caja.top }) }}
          className="z-[70] max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-pop"
        >
          {items.length === 0 && <li role="presentation" className="px-3 py-3 text-sm text-ink-soft">Sin resultados para «{consulta}».</li>}
          {items.map((o, i) => (
            <li
              key={o.value} id={`${id}-op-${i}`} role="option" aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} onMouseMove={() => setActivo(i)}
              className={cn('cursor-pointer px-3 py-2 text-sm', i === activo ? 'bg-brand-tint text-ink' : 'text-ink-soft', o.value === value && 'font-semibold text-ink')}
            >
              {o.label}
              {o.detail && <span className="ml-2 text-xs text-ink-faint">{o.detail}</span>}
            </li>
          ))}
          {total > items.length && <li role="presentation" className="border-t border-line px-3 py-2 text-xs text-ink-faint">Mostrando {items.length} de {total} coincidencias: sigue escribiendo para acotar.</li>}
        </ul>,
        document.body,
      )}
    </div>
  )
}
