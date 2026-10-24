import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Snowflake, ChevronRight, Lock, WifiOff, ScrollText } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { ROL_LABEL, rutaInicial } from '@/domain/rbac'
import { USUARIOS_DEMO } from '@/mocks/usuarios'
import { Badge } from '@/components/ui'

const PUNTOS = [
  { icon: Lock, titulo: 'Cardex inmutable', texto: 'Cada movimiento de bodega queda registrado; los errores se corrigen con reversas auditadas.' },
  { icon: WifiOff, titulo: 'Terreno sin señal', texto: 'Los técnicos completan sus hojas de servicio offline y se sincronizan al reconectar.' },
  { icon: ScrollText, titulo: 'Auditoría completa', texto: 'Quién cambió qué, cuándo y desde dónde, en todo el sistema.' },
]

/** Login demo: a pantalla completa, con panel de marca desde `lg` y tarjetas de perfil que se reparten el ancho. */
export function LoginPage() {
  const { user, login } = useAuthStore()
  const navigate = useNavigate()
  const from = useLocation().state?.from

  if (user) return <Navigate to={rutaInicial(user.rol)} replace />

  const enter = (id) => {
    const u = login(id)
    // Un técnico nunca debe aterrizar en una ruta del ERP.
    const dest = u.rol !== 'TECNICO' && from?.startsWith('/erp') ? from : rutaInicial(u.rol)
    navigate(dest, { replace: true })
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-brand-dark to-brand p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Snowflake className="h-6 w-6" /></span>
          <div className="leading-tight"><p className="text-lg font-bold">FYAG ERP</p><p className="text-sm text-white/70">Frío y Agroindustria SpA</p></div>
        </div>
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">Obras, bodega y terreno en un solo lugar.</h2>
          <p className="mt-3 text-white/75">Portal de oficina y app móvil para los técnicos, sobre un mismo dominio de negocio. Región de Ñuble.</p>
          <ul className="mt-8 space-y-5">
            {PUNTOS.map(({ icon: Icono, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icono className="h-4 w-4" /></span>
                <div><p className="font-semibold">{titulo}</p><p className="text-sm text-white/70">{texto}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Prototipo · Proyecto Integrado INACAP Chillán</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div className="w-full max-w-4xl">
          <div className="mb-8 text-center lg:text-left">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white lg:hidden"><Snowflake className="h-6 w-6" /></span>
            <h1 className="mt-4 text-2xl font-bold lg:mt-0 xl:text-3xl">Ingresa a FYAG ERP</h1>
            <p className="mt-1 text-sm text-ink-soft">Frío y Agroindustria SpA · Región de Ñuble</p>
            <div className="mt-3"><Badge tone="info">Modo demo · selecciona un perfil</Badge></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 2xl:grid-cols-3">
            {USUARIOS_DEMO.map((u) => (
              <button
                key={u.id}
                onClick={() => enter(u.id)}
                className="card group flex min-h-[5.5rem] items-center justify-between gap-3 p-4 text-left transition-colors hover:border-brand sm:p-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.nombre}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">{u.cargo}</p>
                  <div className="mt-2"><Badge tone={u.rol === 'TECNICO' ? 'warn' : 'neutral'}>{ROL_LABEL[u.rol]}</Badge></div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-ink-faint lg:text-left">Técnicos ingresan a la app de terreno (/app); el resto al portal ERP (/erp).</p>
        </div>
      </main>
    </div>
  )
}
