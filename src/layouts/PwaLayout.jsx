import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, WifiOff, Wifi } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { cn } from '@/components/ui'
import { BrandMark } from '@/components/domain'
import { SyncManager } from './SyncManager'

const TITULOS = {
  '/app/asistencia': 'Marcar entrada o salida',
  '/app/hoja-servicio': 'Hoja de servicio',
  '/app/retiro': 'Pedir materiales',
  '/app/sync': 'Envíos pendientes',
}

/** Estado de la señal con palabras simples. Tocarlo alterna el modo sin señal (solo demostración). */
function Senal() {
  const { online, pendientes, setOnline, sincronizando } = useSyncStore()
  return (
    <button
      type="button"
      onClick={() => setOnline(!online)}
      className={cn('flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-center text-[15px] font-semibold', online ? 'bg-ok-bg text-ok' : 'bg-harvest-bg text-warn')}
      aria-label="Alternar modo sin señal (demostración)"
    >
      {online ? <Wifi className="h-5 w-5 shrink-0" /> : <WifiOff className="h-5 w-5 shrink-0" />}
      <span>
        {sincronizando ? 'Enviando…' : online ? 'Con señal' : 'Sin señal: lo que hagas se guarda y se envía solo'}
        {pendientes.length > 0 && online && !sincronizando && ` · ${pendientes.length} por enviar`}
      </span>
    </button>
  )
}

/** Marco de la app de terreno: logo arriba, una sola acción por pantalla y un botón grande para volver al inicio. */
export function PwaLayout() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const titulo = TITULOS[pathname]

  return (
    // En teléfono ocupa toda la pantalla; en computador se muestra como un teléfono centrado (demostración).
    <div className="flex h-full items-center justify-center bg-deep sm:p-6">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#F4F7F9] sm:h-[min(52.75rem,calc(100vh-3rem))] sm:w-[390px] sm:rounded-[2.5rem] sm:border-[10px] sm:border-[#05151F] sm:shadow-pop">
        <SyncManager />
        <header className="flex shrink-0 items-center justify-between border-b-4 border-brand bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <BrandMark height={60} />
          <button
            type="button"
            onClick={() => { logout(); navigate('/login', { replace: true }) }}
            className="flex h-12 items-center gap-2 rounded-xl border-2 border-line-strong px-4 text-[15px] font-semibold text-ink active:bg-slate-100"
          >
            <LogOut className="h-5 w-5" />Salir
          </button>
        </header>
        <Senal />
        <main className="terreno flex-1 overflow-y-auto p-4">
          {titulo && (
            <div className="mb-5 space-y-3">
              <Link to="/app" className="flex h-14 w-full items-center gap-3 rounded-2xl border-2 border-deep bg-white px-4 text-lg font-bold text-deep active:bg-slate-100">
                <ArrowLeft className="h-6 w-6" />Volver al inicio
              </Link>
              <h1 className="t-display text-[1.9rem] leading-tight text-ink">{titulo}</h1>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
