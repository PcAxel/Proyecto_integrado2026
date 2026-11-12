import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { PanelApariencia } from '@/components/PanelApariencia'
import { useApariencia } from '@/hooks/useApariencia'
import { can } from '@/domain/rbac'
import { ROL_API_LABEL } from '@/components/domain'
import { cn } from '@/components/ui'
import { Avatar, BrandMark } from '@/components/domain'
import { ERP_NAV } from './nav'
import { GlobalSearch } from './GlobalSearch'
import { AsistenteIA } from '@/features/ia/AsistenteIA'

const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? navigator.userAgent)

/** Entrada de búsqueda de la cabecera: abre la paleta de comandos. En pantallas angostas queda solo el ícono. */
function BotonBuscar({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir búsqueda global"
      aria-keyshortcuts="Control+K Meta+K"
      className="group flex items-center gap-2.5 rounded-md border border-fyag-ice/15 bg-fyag-deep/20 px-3 py-1.5 text-xs text-fyag-ice transition-colors duration-150 hover:border-fyag-ice/30 md:w-72 lg:w-96"
    >
      <Search className="h-4 w-4 shrink-0 text-fyag-ice/70 transition-colors group-hover:text-fyag-cream" aria-hidden="true" />
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
              <p className={cn('px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-fyag-ice/50', mostrarTexto)}>{grupo}</p>
              {modo === 'riel' && <div className={cn('mx-3 mb-2 h-px bg-fyag-ice/10', collapsed ? 'block' : 'block xl:hidden')} aria-hidden="true" />}
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
                      'group relative flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                      isActive ? 'border-fyag-ice/20 bg-fyag-teal/30 text-fyag-cream' : 'border-transparent text-fyag-ice/75 hover:bg-fyag-deep/30 hover:text-fyag-cream',
                      modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-2.5'),
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-fyag-ice' : 'text-fyag-ice/60 group-hover:text-fyag-cream')} />
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

function MarcaLateral({ collapsed, modo = 'riel', onToggle }) {
  const texto = modo === 'menu' ? '' : collapsed ? 'hidden' : 'hidden xl:inline'
  return (
    <div className={cn('flex h-14 shrink-0 items-center justify-between border-b border-fyag-ice/10 px-3', modo === 'riel' && (collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-between xl:px-3'))}>
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/logo-fyag.png" alt="Frío y Agroindustria SpA" className="h-7 w-7 shrink-0 select-none rounded-md bg-white/95 object-contain p-0.5" draggable={false} />
        <span className={cn('truncate text-sm font-semibold tracking-tight text-fyag-cream', texto)}>FYAG ERP</span>
      </div>
      {onToggle && !collapsed && (
        <button type="button" onClick={onToggle} aria-label="Contraer menú" title="Contraer menú" className="hidden h-7 w-7 items-center justify-center rounded-md text-fyag-ice/60 transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream xl:flex">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** La persona al pie del menú: quién está conectada, con qué rol, y cómo salir o contraer el menú. */
function PieUsuario({ collapsed, modo = 'riel', onSalir, onToggle }) {
  const user = useAuthStore((s) => s.user)
  const texto = modo === 'menu' ? '' : collapsed ? 'hidden' : 'hidden xl:block'
  const fila = modo === 'riel' && (collapsed ? 'flex-col px-0' : 'flex-col px-0 xl:flex-row xl:px-2')
  const boton = 'flex h-8 items-center justify-center gap-2 rounded-md text-[13px] text-fyag-ice/70 transition-colors hover:bg-fyag-deep/30 hover:text-fyag-cream'
  return (
    <div className="shrink-0 border-t border-fyag-ice/10 p-3">
      <div className={cn('flex items-center gap-3 rounded-lg p-2', fila)}>
        <Avatar nombre={user.nombre} rol={user.rol} size="md" />
        <div className={cn('min-w-0 flex-1', texto)}>
          <p className="truncate text-[13px] font-semibold leading-tight text-fyag-cream">{user.nombre}</p>
          <p className="truncate text-xs text-fyag-ice/60">{ROL_API_LABEL[user.rolApi]}</p>
        </div>
      </div>
      <div className={cn('mt-1 flex gap-1', modo === 'riel' && (collapsed ? 'flex-col' : 'flex-col xl:flex-row'))}>
        <button type="button" onClick={onSalir} aria-label="Cerrar sesión" title="Cerrar sesión" className={cn(boton, 'flex-1')}>
          <LogOut className="h-4 w-4" />
          <span className={cn(texto)}>Cerrar sesión</span>
        </button>
        {onToggle && collapsed && (
          <button type="button" onClick={onToggle} aria-label="Expandir menú" title="Expandir menú" className={cn(boton, 'hidden w-8 xl:flex')}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

const FONDO_LATERAL = 'bg-fyag-bg'

export function ErpLayout() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebar } = useUiStore()
  const navigate = useNavigate()
  const [buscando, setBuscando] = useState(false)
  const salir = () => { logout(); navigate('/login', { replace: true }) }

  // Tema oscuro solo mientras se está en el ERP; va en <html> para que también lo hereden modales y paneles fuera del layout.
  useEffect(() => {
    document.documentElement.classList.add('tema-erp')
    return () => document.documentElement.classList.remove('tema-erp')
  }, [])

  // Día/noche, paleta y tamaño de letra: se recuerdan por persona; el ERP empieza oscuro mientras no elija otra cosa.
  useApariencia(user.id, 100)

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
    <div className="flex h-full bg-fyag-bg text-fyag-cream">
      <aside className={cn('relative hidden shrink-0 flex-col border-r border-fyag-ice/10 text-fyag-cream transition-[width] duration-200 sm:flex', FONDO_LATERAL, sidebarCollapsed ? 'w-[72px]' : 'w-[72px] xl:w-64')}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MarcaLateral collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <Navegacion collapsed={sidebarCollapsed} />
          <PieUsuario collapsed={sidebarCollapsed} onSalir={salir} onToggle={toggleSidebar} />
        </div>
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]" onClick={() => setMobileSidebar(false)} />
          <aside className={cn('relative flex h-full w-72 animate-slide-in flex-col border-r border-fyag-ice/10 text-fyag-cream shadow-pop', FONDO_LATERAL)}>
            <div className="absolute right-3 top-3"><button type="button" aria-label="Cerrar menú" onClick={() => setMobileSidebar(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-fyag-ice/70 hover:bg-fyag-deep/30 hover:text-fyag-cream"><X className="h-5 w-5" /></button></div>
            <MarcaLateral modo="menu" />
            <Navegacion modo="menu" onNavigate={() => setMobileSidebar(false)} />
            <PieUsuario modo="menu" onSalir={salir} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-fyag-ice/10 bg-fyag-bg/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button type="button" aria-label="Abrir menú" onClick={() => setMobileSidebar(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-fyag-ice hover:bg-fyag-deep/30 hover:text-fyag-cream sm:hidden"><Menu className="h-5 w-5" /></button>
          <BotonBuscar onClick={() => setBuscando(true)} />
          <div className="ml-auto flex items-center gap-3">
            <PanelApariencia nivelDefecto={100} />
            <div className="flex items-center gap-2 sm:hidden"><Avatar nombre={user.nombre} rol={user.rol} size="sm" /></div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-10">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={buscando} onClose={() => setBuscando(false)} />
      <AsistenteIA />
    </div>
  )
}
