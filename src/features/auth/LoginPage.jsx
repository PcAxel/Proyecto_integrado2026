import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { ROL_LABEL, ROL_DESCRIPCION, rutaInicial } from '@/domain/rbac'
import { usuariosService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { Skeleton, cn } from '@/components/ui'
import { Avatar, BrandMark } from '@/components/domain'

const fmt = (n) => n.toFixed(1).replace('.', ',')

/**
 * Lectura de una cámara de frío, como la del controlador de una cámara real: la temperatura oscila unas décimas
 * alrededor del punto de consigna. Es lo único que se mueve en esta pantalla, y se detiene con «reducir movimiento».
 */
function LecturaCamara() {
  const [t, setT] = useState(-18.0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = setInterval(() => setT(-18 + (Math.random() - 0.5) * 0.5), 2200)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="instrument max-w-md border border-white/10 p-6" aria-hidden="true">
      <div className="lattice pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative">
        <div className="flex items-center justify-between text-sm text-white/65">
          <span>Cámara 3 · Packing Cordillera</span>
          <span className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ice/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-ice" /></span>En rango</span>
        </div>
        <p className="t-display mt-4 text-[5.5rem] leading-none tabular-nums text-white">{fmt(t)}<span className="ml-1 text-4xl text-ice">°C</span></p>
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
          <div><p className="text-white/50">Consigna</p><p className="t-display mt-0.5 text-xl text-white">−18,0 °C</p></div>
          <div><p className="text-white/50">Compresor</p><p className="t-display mt-0.5 text-xl text-white">Operando</p></div>
          <div><p className="text-white/50">Descarche</p><p className="t-display mt-0.5 text-xl text-white">en 4 h</p></div>
        </div>
      </div>
    </div>
  )
}

/** Ingreso demo: elige un perfil y entra a la vista que le corresponde. */
export function LoginPage() {
  const { user, login } = useAuthStore()
  const navigate = useNavigate()
  const from = useLocation().state?.from
  const perfiles = useResource(() => usuariosService.perfiles(), [])

  if (user) return <Navigate to={rutaInicial(user.rol)} replace />

  const enter = (perfil) => {
    const u = login(perfil.id, perfil)
    // Un técnico nunca debe aterrizar en una ruta del ERP.
    const dest = u.rol !== 'TECNICO' && from?.startsWith('/erp') ? from : rutaInicial(u.rol)
    navigate(dest, { replace: true })
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-deep via-deep to-[#081E2C] p-10 text-white lg:flex xl:p-14">
        <div className="lattice pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-brand/25 blur-3xl" aria-hidden="true" />
        <div className="relative"><BrandMark height={96} placa /></div>
        <div className="relative space-y-10">
          <div className="max-w-md">
            <h2 className="t-display text-[3.2rem] leading-[1.02] xl:text-[3.8rem]">De la cámara de frío a la gerencia, en un solo sistema.</h2>
            <p className="mt-5 text-lg leading-relaxed text-white/70">Obras, bodega y terreno conectados, con cada persona viendo solo lo que necesita para su trabajo.</p>
          </div>
          <LecturaCamara />
        </div>
        <p className="relative text-sm text-white/45">Región de Ñuble, Chile</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-4xl">
          <div className="mb-8 lg:hidden"><BrandMark height={56} /></div>
          <h1 className="t-display text-[2.4rem] leading-none sm:text-[3rem]">¿Quién ingresa hoy?</h1>
          <p className="mt-3 max-w-xl text-ink-soft">Elige un perfil de demostración. Cada rol entra a una vista distinta, con las herramientas que le corresponden.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {!perfiles.data && <div className="card sm:col-span-2"><Skeleton rows={4} /></div>}
            {(perfiles.data ?? []).map((u) => (
              <button
                key={u.id}
                onClick={() => enter(u)}
                className={cn('card group flex items-start gap-4 p-4 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift sm:p-5')}
              >
                <Avatar nombre={u.nombre} rol={u.rol} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{u.nombre}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1 text-brand opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="block truncate text-sm text-ink-soft">{u.cargo}</span>
                  <span className="mt-2 block text-[13px] font-medium text-brand-dark">{ROL_LABEL[u.rol]}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-soft">{ROL_DESCRIPCION[u.rol]}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-faint">Los técnicos ingresan a la app de terreno; el resto, al portal de oficina.</p>
        </div>
      </main>
    </div>
  )
}
