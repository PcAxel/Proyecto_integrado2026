import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Snowflake, UserCog } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { can, ROL_LABEL, rutaInicial } from '@/domain/rbac'
import { USUARIOS_DEMO } from '@/mocks/usuarios'
import { IconButton, cn } from '@/components/ui'
import { ERP_NAV } from './nav'

/** modo 'riel': barra lateral de escritorio (íconos hasta xl, etiquetas desde xl). modo 'menu': cajón del teléfono. */
function Sidebar({ collapsed, onNavigate, modo = 'riel' }) {
  const rol = useAuthStore((s) => s.user?.rol)
  const items = ERP_NAV.filter((i) => can(rol, i.accion))
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Principal">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={modo === 'riel' ? label : undefined}
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-tint text-brand' : 'text-ink-soft hover:bg-slate-50 hover:text-ink',
              modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-3'),
            )
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span className={cn('truncate', modo === 'riel' && (collapsed ? 'hidden' : 'hidden xl:inline'))}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function Brand({ collapsed, modo = 'riel' }) {
  return (
    <div className={cn('flex h-14 items-center gap-2.5 border-b border-line px-4', modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-4'))}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <Snowflake className="h-4 w-4" />
      </span>
      {(modo === 'menu' || !collapsed) && (
        <div className={cn('leading-tight', modo === 'riel' && 'hidden xl:block')}>
          <p className="text-sm font-bold">FYAG ERP</p>
          <p className="text-[11px] text-ink-soft">Frío y Agroindustria</p>
        </div>
      )}
    </div>
  )
}

/** Selector de rol para modo demo: cambia de usuario sin pasar por login. */
function RoleSwitcher({ className = 'hidden sm:flex' }) {
  const { user, switchRole } = useAuthStore()
  const navigate = useNavigate()
  const onChange = (e) => {
    const next = switchRole(e.target.value)
    if (next) navigate(rutaInicial(next.rol), { replace: true })
  }
  return (
    <label className={cn('items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1 text-xs text-ink-soft', className)}>
      <UserCog className="h-4 w-4" />
      <span>Demo:</span>
      <select value={user.id} onChange={onChange} className="bg-transparent font-medium text-ink focus:outline-none" aria-label="Cambiar rol (demo)">
        {USUARIOS_DEMO.map((u) => (
          <option key={u.id} value={u.id}>{ROL_LABEL[u.rol]}</option>
        ))}
      </select>
    </label>
  )
}

export function ErpLayout() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebar } = useUiStore()
  const navigate = useNavigate()
  const initials = user.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')

  return (
    <div className="flex h-full">
      <aside className={cn('hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] sm:flex', sidebarCollapsed ? 'w-16' : 'w-16 xl:w-64')}>
        <Brand collapsed={sidebarCollapsed} />
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileSidebar(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-surface">
            <Brand modo="menu" />
            <Sidebar modo="menu" onNavigate={() => setMobileSidebar(false)} />
            <div className="border-t border-line p-3 sm:hidden"><RoleSwitcher className="flex w-full" /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
          <div className="flex items-center gap-1">
            <IconButton icon={Menu} label="Abrir menú" className="sm:hidden" onClick={() => setMobileSidebar(true)} />
            <IconButton
              icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
              label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
              className="hidden xl:inline-flex"
              onClick={toggleSidebar}
            />
          </div>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">{initials}</span>
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-medium">{user.nombre}</p>
                <p className="text-[11px] text-ink-soft">{ROL_LABEL[user.rol]}</p>
              </div>
            </div>
            <IconButton icon={LogOut} label="Cerrar sesión" onClick={() => { logout(); navigate('/login', { replace: true }) }} />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}