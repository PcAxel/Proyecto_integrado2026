import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff } from 'lucide-react'
import { cn } from '@/components/ui'
import { notificacionesService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'

const CADA_MS = 45_000
const OBRA = /\bOB-\d{1,6}\b/

/**
 * Campanita de avisos del flujo (p. ej. «Auditoría OK. Lista para facturar»). Muestra un punto rojo con la cantidad sin leer y, al abrirla,
 * lista los avisos y los marca como leídos. Consulta al servidor cada 45 s mientras la pestaña está visible.
 */
export function NotificacionesBell() {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.user?.rol)
  const [avisos, setAvisos] = useState([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [abierta, setAbierta] = useState(false)
  const [nuevos, setNuevos] = useState(() => new Set()) // ids que estaban sin leer al abrir: se siguen resaltando mientras el menú está abierto
  const raiz = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const r = await notificacionesService.listar()
      setAvisos(r.resultados)
      setNoLeidas(r.no_leidas)
      return r
    } catch { return null } // sin conexión o sesión vencida: lo maneja el cliente HTTP; la campanita no molesta
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, CADA_MS)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    if (!abierta) return undefined
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setAbierta(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierta])

  const alternar = async () => {
    if (abierta) { setAbierta(false); return }
    setAbierta(true)
    const r = await cargar()
    const sinLeer = (r?.resultados ?? avisos).filter((a) => !a.leida)
    setNuevos(new Set(sinLeer.map((a) => a.id)))
    if (sinLeer.length) {
      try { const m = await notificacionesService.marcarLeidas(sinLeer.map((a) => a.id)); setNoLeidas(m.no_leidas) } catch { /* se reintenta al volver a abrir */ }
    }
  }

  const ir = (a) => {
    const obra = OBRA.exec(a.mensaje)?.[0]
    if (!obra) return
    setAbierta(false)
    // Un aviso de «lista para facturar» lleva a la tarjeta de facturación, solo para quien puede emitir.
    navigate(a.tipo === 'FACTURACION_LISTA' && can(rol, 'facturacion.emitir') ? `/erp/obras/${obra}?facturar=1` : `/erp/obras/${obra}`)
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button" onClick={alternar} aria-haspopup="true" aria-expanded={abierta}
        aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'} title="Notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-fyag-ice transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-bold leading-none text-white ring-2 ring-fyag-bg">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div role="menu" aria-label="Notificaciones" className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Notificaciones</p>
          {avisos.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-ink-soft"><BellOff className="h-6 w-6 text-ink-faint" aria-hidden="true" />No tienes avisos por ahora.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {avisos.map((a) => {
                const nuevo = nuevos.has(a.id)
                const enlace = OBRA.test(a.mensaje)
                return (
                  <li key={a.id} role="none">
                    <button type="button" role="menuitem" onClick={() => ir(a)} disabled={!enlace}
                      className={cn('flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition-colors', nuevo ? 'bg-brand-tint/60' : '', enlace ? 'hover:bg-brand-tint/40' : 'cursor-default')}>
                      <span className={cn('text-ink', nuevo && 'font-semibold')}>{a.mensaje}</span>
                      <span className="text-xs text-ink-faint">{formatFechaHora(a.fecha_creacion)}{nuevo ? ' · nuevo' : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
