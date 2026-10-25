import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, HardHat, FileText, User, Truck, Package, ClipboardCheck, Building2, Shield, Plus, Loader2 } from 'lucide-react'
import { Overlay, cn } from '@/components/ui'
import { busquedaService } from '@/services'
import { buscar, aplanar, moverSeleccion } from '@/domain/busqueda'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { ERP_NAV } from './nav'

const ICONOS = { obra: HardHat, presupuesto: FileText, persona: User, vehiculo: Truck, articulo: Package, hoja: ClipboardCheck, empresa: Building2, usuario: Shield, accion: Plus }
/** Los datos del índice se consideran frescos este tiempo; después se vuelven a pedir al abrir. */
const VIGENCIA_MS = 30_000

/** Rutas y acciones disponibles para el rol: se calculan al instante, sin esperar al servicio. */
function itemsDeNavegacion(rol) {
  const rutas = ERP_NAV.filter((n) => can(rol, n.accion)).map((n) => ({
    id: `ruta-${n.to}`, grupo: 'Navegación', icono: n.icon, titulo: `Ir a ${n.label}`, keywords: n.palabras, ruta: n.to,
  }))
  const acciones = [
    ['presupuestos.crear', 'Crear presupuesto', '/erp/presupuestos/nuevo', ['nuevo', 'cotizacion']],
    ['obras.crear', 'Crear obra', '/erp/obras/nueva', ['nueva', 'proyecto']],
    ['usuarios.crear', 'Nuevo acceso de usuario', '/erp/usuarios?nuevo=1', ['crear usuario', 'alta', 'contrasena']],
  ].filter(([accion]) => can(rol, accion)).map(([, titulo, ruta, keywords]) => ({ id: `accion-${ruta}`, grupo: 'Acciones', icono: 'accion', titulo, keywords, ruta }))
  return [...rutas, ...acciones]
}

/**
 * Paleta de comandos (Ctrl/⌘ + K). Patrón combobox accesible: el foco permanece en el campo,
 * la opción activa se anuncia con aria-activedescendant y el resto de la página queda inerte.
 * @param {{open:boolean, onClose:()=>void}} props
 */
export function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [consulta, setConsulta] = useState('')
  const [activo, setActivo] = useState(0)
  const [indice, setIndice] = useState([])
  const [cargando, setCargando] = useState(false)
  const cache = useRef({ usuario: null, t: 0, datos: [] })
  const entrada = useRef(null)

  const base = useMemo(() => itemsDeNavegacion(user.rol), [user.rol])
  const grupos = useMemo(() => buscar([...base, ...indice], consulta), [base, indice, consulta])
  const planos = useMemo(() => aplanar(grupos), [grupos])

  // Al abrir: limpia, enfoca el campo y carga (o reutiliza) los datos; al cerrar devuelve el foco a quien lo tenía.
  useEffect(() => {
    if (!open) return undefined
    const previo = document.activeElement
    setConsulta('')
    setActivo(0)
    const c = cache.current
    const fresco = c.usuario === user.id && Date.now() - c.t < VIGENCIA_MS
    let vigente = true
    if (fresco) {
      setIndice(c.datos)
    } else {
      setIndice([])
      setCargando(true)
      busquedaService.indice().then((datos) => {
        if (!vigente) return
        cache.current = { usuario: user.id, t: Date.now(), datos }
        setIndice(datos)
      }).catch(() => {}).finally(() => vigente && setCargando(false))
    }
    const t = setTimeout(() => entrada.current?.focus(), 0)
    return () => { vigente = false; clearTimeout(t); previo?.focus?.() }
  }, [open, user.id])

  useEffect(() => { setActivo(0) }, [consulta])
  useEffect(() => { document.getElementById(`gs-opcion-${activo}`)?.scrollIntoView({ block: 'nearest' }) }, [activo])

  if (!open) return null

  const ir = (item) => {
    if (!item) return
    onClose()
    navigate(item.ruta)
  }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => moverSeleccion(a, 1, planos.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => moverSeleccion(a, -1, planos.length)) }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setActivo(Math.max(0, planos.length - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); ir(planos[activo]) }
    else if (e.key === 'Tab') e.preventDefault() // el diálogo solo tiene un control: el foco no debe escapar
  }

  let n = -1
  return (
    <Overlay open onClose={onClose} align="top">
      <div role="dialog" aria-modal="true" aria-label="Búsqueda global" className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            ref={entrada}
            role="combobox"
            aria-expanded="true"
            aria-controls="gs-lista"
            aria-activedescendant={planos.length ? `gs-opcion-${activo}` : undefined}
            aria-autocomplete="list"
            aria-label="Buscar en el sistema"
            autoComplete="off"
            spellCheck={false}
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar obras, personas, vehículos, páginas…"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-faint focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {cargando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-faint" aria-label="Cargando datos" />}
          <kbd className="hidden rounded border border-line bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-soft sm:inline">Esc</kbd>
        </div>

        <div id="gs-lista" role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
          {grupos.map((g) => (
            <div key={g.grupo} role="group" aria-labelledby={`gs-grupo-${g.grupo}`} className="mb-1">
              <p id={`gs-grupo-${g.grupo}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{g.grupo}</p>
              {g.items.map((it) => {
                n += 1
                const i = n
                const Icono = typeof it.icono === 'string' ? ICONOS[it.icono] : it.icono
                const sel = i === activo
                return (
                  <div
                    key={it.id}
                    id={`gs-opcion-${i}`}
                    role="option"
                    aria-selected={sel}
                    onMouseMove={() => i !== activo && setActivo(i)}
                    onClick={() => ir(it)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', sel ? 'bg-brand-tint' : 'hover:bg-slate-50')}
                  >
                    {Icono && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', sel ? 'bg-white text-brand' : 'bg-slate-100 text-ink-soft')}><Icono className="h-4 w-4" aria-hidden="true" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', sel ? 'font-semibold text-brand' : 'font-medium')}>{it.titulo}</span>
                      {it.subtitulo && <span className="block truncate text-xs text-ink-soft">{it.subtitulo}</span>}
                    </span>
                    {it.codigo && <span className="hidden shrink-0 font-mono text-xs text-ink-faint sm:inline">{it.codigo}</span>}
                    {sel && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />}
                  </div>
                )
              })}
            </div>
          ))}
          {!planos.length && !cargando && (
            <p className="px-3 py-10 text-center text-sm text-ink-soft">Sin resultados para «{consulta}». Prueba con un código (OB-0005), un nombre o una patente.</p>
          )}
          {!planos.length && cargando && <p className="px-3 py-10 text-center text-sm text-ink-soft">Buscando…</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line bg-slate-50 px-4 py-2 text-[11px] text-ink-soft">
          <span className="flex items-center gap-3"><span><kbd className="font-mono">↑↓</kbd> navegar</span><span><kbd className="font-mono">↵</kbd> abrir</span><span><kbd className="font-mono">esc</kbd> cerrar</span></span>
          <span aria-live="polite">{planos.length} resultado{planos.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </Overlay>
  )
}
