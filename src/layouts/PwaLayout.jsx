import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ClipboardList, PackageOpen, RefreshCw, LogOut, WifiOff, Wifi } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { IconButton, cn } from '@/components/ui'
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
        online ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn',
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
    <div className="flex h-full items-center justify-center bg-slate-200 sm:p-6">
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas sm:h-[min(52.75rem,calc(100vh-3rem))] sm:w-[390px] sm:rounded-[2.5rem] sm:border-[10px] sm:border-slate-900 sm:shadow-2xl">
      <SyncManager />
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <div className="leading-tight">
          <p className="text-sm font-semibold">{user.nombre}</p>
          <p className="text-[11px] text-ink-soft">{user.cargo}</p>
        </div>
        <IconButton icon={LogOut} label="Cerrar sesión" onClick={() => { logout(); navigate('/login', { replace: true }) }} />
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
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-soft')
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
    </div>
  )
}
