import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsUpDown, Loader2, X } from 'lucide-react'
import { crearBuscador } from '@/domain/buscadorAsincrono'
import { inputBase, TextoEtiqueta } from './Field'
import { cn } from './cn'

/**
 * Selector con búsqueda en el SERVIDOR para campos que relacionan datos (proveedor, artículo, cliente, obra…). Nunca recibe la lista completa:
 * mientras se escribe pide pocas coincidencias a `buscar(texto)` (con espera de 250 ms entre teclas) y descarta respuestas viejas.
 * Teclado: ↑ ↓ Enter Esc. La lista va en un portal para que no la corte el scroll de un modal.
 * @param {{label?:string, value:string, onChange:(id:string, opcion:{id:string,label:string,detalle?:string}|null)=>void,
 *   buscar:(texto:string)=>Promise<Array<{id:string,label:string,detalle?:string}>>, cargarSeleccion:(id:string)=>Promise<{id:string,label:string}|null>,
 *   placeholder?:string, hint?:string, error?:string, disabled?:boolean, obligatorio?:boolean, opcional?:boolean, className?:string}} props
 */
export function AsyncCombobox({ label, value, onChange, buscar, cargarSeleccion, placeholder = 'Escribe para buscar…', hint, error, disabled, obligatorio, opcional, className, ...rest }) {
  const id = useId()
  const lista = `${id}-lista`
  const raiz = useRef(null)
  const entrada = useRef(null)
  const buscarRef = useRef(buscar)
  buscarRef.current = buscar
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState(null)
  const [activo, setActivo] = useState(0)
  const [elegida, setElegida] = useState(null) // la opción mostrada cuando no se está escribiendo
  const [caja, setCaja] = useState(null)

  const buscador = useMemo(() => crearBuscador({
    buscar: (t) => buscarRef.current(t), alCargar: setCargando, alResultado: (r) => { setFallo(null); setItems(r) }, alError: (e) => setFallo(e.message || 'No se pudo buscar'),
  }), [])
  useEffect(() => () => buscador.cancelar(), [buscador])

  // Si ya hay un valor (al editar), se pide solo ESA fila para mostrar su nombre: no la lista.
  useEffect(() => {
    let vigente = true
    if (!value) { setElegida(null); return undefined }
    if (elegida?.id === value) return undefined
    cargarSeleccion?.(value).then((o) => { if (vigente && o) setElegida(o) }).catch(() => {})
    return () => { vigente = false }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { setActivo(0) }, [items])

  const cerrar = () => { buscador.cancelar(); setCargando(false); setAbierto(false); setEditando(false); setTexto('') }
  const elegir = (o) => { setElegida(o); onChange(o.id, o); cerrar(); entrada.current?.blur() }
  const limpiar = () => { setElegida(null); onChange('', null); setTexto(''); setEditando(true); setAbierto(true); buscador.consultar('', { inmediato: true }); entrada.current?.focus() }
  const escribir = (t) => { setTexto(t); setEditando(true); setAbierto(true); buscador.consultar(t) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierto) { setAbierto(true); buscador.consultar(texto, { inmediato: true }) } else setActivo((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && abierto && items[activo]) { e.preventDefault(); elegir(items[activo]) }
    else if (e.key === 'Escape' && abierto) { e.stopPropagation(); cerrar() }
  }

  const visible = editando ? texto : elegida?.label ?? ''
  const hacia = caja && typeof window !== 'undefined' && window.innerHeight - caja.top < 260 && caja.arriba > 260

  return (
    <div className={cn('block', className)} ref={raiz}>
      {label && <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink"><TextoEtiqueta texto={label} obligatorio={obligatorio} opcional={opcional} /></label>}
      <div className="relative">
        <input
          ref={entrada} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false} disabled={disabled}
          aria-expanded={abierto} aria-controls={lista} aria-autocomplete="list" aria-required={obligatorio || undefined} aria-invalid={error ? true : undefined}
          aria-activedescendant={abierto && items[activo] ? `${id}-op-${activo}` : undefined}
          value={visible} placeholder={placeholder}
          onFocus={(e) => { setAbierto(true); e.target.select(); buscador.consultar('', { inmediato: true }) }}
          onChange={(e) => escribir(e.target.value)} onKeyDown={onKeyDown}
          className={cn(inputBase, 'h-10 pr-16', error && 'border-crit')} {...rest}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-ink-faint">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Buscando" />
            : elegida && !disabled && <button type="button" tabIndex={-1} aria-label="Quitar selección" onMouseDown={(e) => e.preventDefault()} onClick={limpiar} className="pointer-events-auto rounded p-1 hover:bg-slate-100 hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
          <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      {error ? <span className="mt-1.5 block text-xs font-medium text-crit">{error}</span> : hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>}

      {abierto && caja && createPortal(
        <ul id={lista} role="listbox" aria-label={label ?? 'Resultados'} aria-busy={cargando}
          style={{ position: 'fixed', left: caja.left, width: caja.width, ...(hacia ? { bottom: window.innerHeight - caja.arriba + 4 } : { top: caja.top }) }}
          className="z-[70] max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-pop">
          {fallo && <li role="presentation" className="px-3 py-3 text-sm text-crit">No se pudo buscar: {fallo}</li>}
          {!fallo && !cargando && items.length === 0 && <li role="presentation" className="px-3 py-3 text-sm text-ink-soft">{texto ? `Sin resultados para «${texto}».` : 'No hay resultados.'}</li>}
          {items.map((o, i) => (
            <li key={o.id} id={`${id}-op-${i}`} role="option" aria-selected={o.id === value} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} onMouseMove={() => setActivo(i)}
              className={cn('cursor-pointer px-3 py-2 text-sm', i === activo ? 'bg-brand-tint text-ink' : 'text-ink-soft', o.id === value && 'font-semibold text-ink')}>
              {o.label}{o.detalle && <span className="ml-2 text-xs text-ink-faint">{o.detalle}</span>}
            </li>
          ))}
          {!fallo && items.length >= 15 && <li role="presentation" className="border-t border-line px-3 py-2 text-xs text-ink-faint">Mostrando las primeras coincidencias: sigue escribiendo para acotar.</li>}
        </ul>,
        document.body,
      )}
    </div>
  )
}
