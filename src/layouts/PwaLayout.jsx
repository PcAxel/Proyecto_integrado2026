import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ClipboardList, PackageOpen, RefreshCw, LogOut, WifiOff, Wifi } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { cn } from '@/components/ui'
import { Avatar } from '@/components/domain'
import { SyncManager } from './SyncManager'

const TABS = [
  { to: '/app', label: 'Hoy', icon: Home, end: true },
  { to: '/app/hoja-servicio', label: 'Hoja', icon: ClipboardList },
  { to: '/app/retiro', label: 'Retiro', icon: PackageOpen },
  { to: '/app/sync', label: 'Sync', icon: RefreshCw },
]

function SyncBar() {
  const { online, pendientes, setOnline, sincronizando } = useSyncStore()
  return (
    <button
      onClick={() => setOnline(!online)}
      className={cn(
        'flex h-9 w-full items-center justify-center gap-2 text-xs font-medium',
        online ? 'bg-ok-bg text-ok' : 'bg-harvest-bg text-warn',
      )}
      aria-label="Alternar modo sin señal (demo)"
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {sincronizando ? 'Sincronizando…' : online ? 'En línea' : 'Modo sin señal'}
      {pendientes.length > 0 && <span className="font-mono">· {pendientes.length} en cola</span>}
    </button>
  )
}

export function PwaLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  return (
    // En teléfono ocupa toda la pantalla; en computador se muestra como un teléfono centrado (demostración).
    <div className="flex h-full items-center justify-center bg-deep sm:p-6">
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas sm:h-[min(52.75rem,calc(100vh-3rem))] sm:w-[390px] sm:rounded-[2.5rem] sm:border-[10px] sm:border-[#05151F] sm:shadow-pop">
      <SyncManager />
      <header className="flex h-14 shrink-0 items-center justify-between bg-deep px-4 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center gap-3">
          <Avatar nombre={user.nombre} rol={user.rol} size="sm" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{user.nombre}</p>
            <p className="text-[11px] text-white/60">{user.cargo}</p>
          </div>
        </div>
        <button type="button" aria-label="Cerrar sesión" onClick={() => { logout(); navigate('/login', { replace: true }) }} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><LogOut className="h-5 w-5" /></button>
      </header>
      <SyncBar />
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
      <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Navegación móvil">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand-dark' : 'text-ink-soft')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150', isActive && 'bg-brand-tint')}><Icon className="h-5 w-5" /></span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
    </div>
  )
}
