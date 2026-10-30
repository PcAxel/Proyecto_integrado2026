import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserCog, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { can, ROL_LABEL, rutaInicial } from '@/domain/rbac'
import { usuariosService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { cn } from '@/components/ui'
import { Avatar, BrandMark } from '@/components/domain'
import { ERP_NAV } from './nav'
import { GlobalSearch } from './GlobalSearch'

const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? navigator.userAgent)

/** Entrada de búsqueda de la cabecera: abre la paleta de comandos. En pantallas angostas queda solo el ícono. */
function BotonBuscar({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir búsqueda global"
      aria-keyshortcuts="Control+K Meta+K"
      className="group flex h-10 items-center gap-2.5 rounded-lg border border-line-strong bg-white px-3 text-sm text-ink-soft shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand/50 hover:shadow-card focus-visible:ring-4 md:w-72 lg:w-96"
    >
      <Search className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" aria-hidden="true" />
      <span className="hidden flex-1 truncate text-left md:inline">Buscar... ({esMac ? '⌘K' : 'Ctrl+K'})</span>
    </button>
  )
}

/**
 * Menú agrupado por tipo de tarea y filtrado por permisos.
 * modo 'riel': barra lateral de escritorio (solo íconos hasta xl, con etiquetas desde xl). modo 'menu': cajón del teléfono.
 */
function Navegacion({ collapsed, onNavigate, modo = 'riel' }) {
  const rol = useAuthStore((s) => s.user?.rol)
  const items = ERP_NAV.filter((i) => can(rol, i.accion))
  const grupos = [...new Set(items.map((i) => i.grupo))]
  const mostrarTexto = modo === 'menu' ? '' : collapsed ? 'hidden' : 'hidden xl:inline'

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Principal">
      {grupos.map((grupo, gi) => (
        <div key={grupo} className={gi === 0 ? 'pt-1' : 'pt-4'}>
          {grupo !== 'Inicio' && (
            <>
              <p className={cn('px-3 pb-1.5 text-[12px] font-medium text-white/40', mostrarTexto)}>{grupo}</p>
              {modo === 'riel' && <div className={cn('mx-3 mb-2 h-px bg-white/10', collapsed ? 'block' : 'block xl:hidden')} aria-hidden="true" />}
            </>
          )}
          <ul className="space-y-0.5">
            {items.filter((i) => i.grupo === grupo).map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  title={modo === 'riel' ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors duration-150',
                      isActive ? 'bg-white/[0.11] text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                      modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-3'),
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r-full bg-ice" aria-hidden="true" />}
                      <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-ice' : 'text-white/50 group-hover:text-white/85')} />
                      <span className={cn('truncate', mostrarTexto)}>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function MarcaLateral({ collapsed, modo = 'riel' }) {
  const texto = modo === 'menu' ? '' : collapsed ? 'hidden' : 'hidden xl:block'
  return (
    <div className={cn('flex h-16 shrink-0 items-center gap-3 px-4', modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-5'))}>
      <BrandMark size={34} />
      <div className={cn('leading-none', texto)}>
        <p className="t-display text-[22px] tracking-wide">FYAG</p>
        <p className="mt-1 text-[11px] text-white/50">Frío y Agroindustria</p>
      </div>
    </div>
  )
}

/** La persona al pie del menú: quién está conectada, con qué rol, y cómo salir o contraer el menú. */
function PieUsuario({ collapsed, modo = 'riel', onSalir, onToggle }) {
  const user = useAuthStore((s) => s.user)
  const texto = modo === 'menu' ? '' : collapsed ? 'hidden' : 'hidden xl:block'
  const fila = modo === 'riel' && (collapsed ? 'flex-col px-0' : 'flex-col px-0 xl:flex-row xl:px-2')
  const boton = 'flex h-9 items-center justify-center gap-2 rounded-lg text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.98]'
  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      <div className={cn('flex items-center gap-3 rounded-lg p-2', fila)}>
        <Avatar nombre={user.nombre} rol={user.rol} size="md" />
        <div className={cn('min-w-0 flex-1', texto)}>
          <p className="truncate text-sm font-semibold leading-tight">{user.nombre}</p>
          <p className="truncate text-xs text-white/55">{ROL_LABEL[user.rol]}</p>
        </div>
      </div>
      <div className={cn('mt-1 flex gap-1', modo === 'riel' && (collapsed ? 'flex-col' : 'flex-col xl:flex-row'))}>
        <button type="button" onClick={onSalir} aria-label="Cerrar sesión" title="Cerrar sesión" className={cn(boton, 'flex-1')}>
          <LogOut className="h-[18px] w-[18px]" />
          <span className={cn(texto)}>Cerrar sesión</span>
        </button>
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} title={collapsed ? 'Expandir menú' : 'Contraer menú'} className={cn(boton, 'hidden w-9 xl:flex')}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
    </div>
  )
}

/** Selector de rol para modo demo: cambia de usuario sin pasar por el login. */
function RoleSwitcher({ className = 'hidden sm:flex' }) {
  const { user, switchRole } = useAuthStore()
  const navigate = useNavigate()
  const perfiles = useResource(() => usuariosService.perfiles(), [])
  const onChange = (e) => {
    const next = switchRole(e.target.value, perfiles.data?.find((p) => p.id === e.target.value))
    if (next) navigate(rutaInicial(next.rol), { replace: true })
  }
  return (
    <label className={cn('items-center gap-2 rounded-lg border border-dashed border-harvest/70 bg-harvest-bg/60 px-2.5 py-1.5 text-xs text-warn', className)}>
      <UserCog className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap font-medium">Vista demo</span>
      <select value={user.id} onChange={onChange} className="max-w-[15rem] cursor-pointer truncate bg-transparent font-semibold text-ink focus:outline-none" aria-label="Cambiar rol (demo)">
        {(perfiles.data ?? [user]).map((u) => (
          <option key={u.id} value={u.id}>{ROL_LABEL[u.rol]} · {u.nombre.split(' ')[0]}</option>
        ))}
      </select>
    </label>
  )
}

const FONDO_LATERAL = 'bg-gradient-to-b from-deep via-deep to-[#081E2C]'

export function ErpLayout() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebar } = useUiStore()
  const navigate = useNavigate()
  const [buscando, setBuscando] = useState(false)
  const salir = () => { logout(); navigate('/login', { replace: true }) }

  // Ctrl+K (Windows/Linux) o ⌘K (Mac) abren y cierran la búsqueda desde cualquier pantalla del ERP.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBuscando((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full">
      <aside className={cn('relative hidden shrink-0 flex-col text-white transition-[width] duration-200 sm:flex', FONDO_LATERAL, sidebarCollapsed ? 'w-[72px]' : 'w-[72px] xl:w-64')}>
        <div className="lattice pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_40%)]" aria-hidden="true" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MarcaLateral collapsed={sidebarCollapsed} />
          <Navegacion collapsed={sidebarCollapsed} />
          <PieUsuario collapsed={sidebarCollapsed} onSalir={salir} onToggle={toggleSidebar} />
        </div>
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 animate-fade bg-deep/60 backdrop-blur-[2px]" onClick={() => setMobileSidebar(false)} />
          <aside className={cn('relative flex h-full w-72 animate-slide-in flex-col text-white shadow-pop', FONDO_LATERAL)}>
            <div className="absolute right-3 top-3"><button type="button" aria-label="Cerrar menú" onClick={() => setMobileSidebar(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
            <MarcaLateral modo="menu" />
            <Navegacion modo="menu" onNavigate={() => setMobileSidebar(false)} />
            <div className="border-t border-white/10 p-3"><RoleSwitcher className="flex w-full" /></div>
            <PieUsuario modo="menu" onSalir={salir} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line/80 bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button type="button" aria-label="Abrir menú" onClick={() => setMobileSidebar(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:bg-white hover:text-ink sm:hidden"><Menu className="h-5 w-5" /></button>
          <BotonBuscar onClick={() => setBuscando(true)} />
          <div className="ml-auto flex items-center gap-3">
            <RoleSwitcher />
            <div className="flex items-center gap-2 sm:hidden"><Avatar nombre={user.nombre} rol={user.rol} size="sm" /></div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-10">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={buscando} onClose={() => setBuscando(false)} />
    </div>
  )
}
