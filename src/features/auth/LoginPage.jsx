import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { inicioDeRolApi } from '@/domain/rolesApi'
import { RUTAS_INSTALAR } from '@/domain/instalacion'
import { BrandMark } from '@/components/domain'
import { LoginFlow } from './LoginFlow'

/** Puntos que resumen qué hace el sistema. Es texto institucional, no datos de operación. */
const PUNTOS = [
  ['Obras y presupuestos', 'Del presupuesto aprobado al cierre de la obra, con su costo real.'],
  ['Bodega con trazabilidad', 'Cada material que sale queda ligado a una obra y a una persona.'],
  ['Terreno verificado', 'Asistencia y hojas de servicio con ubicación real del dispositivo.'],
]

function Resumen() {
  return (
    <ul className="relative max-w-md space-y-4 border-t border-white/10 pt-6" aria-label="Qué hace el sistema">
      {PUNTOS.map(([titulo, texto]) => (
        <li key={titulo}>
          <p className="t-display text-xl text-white">{titulo}</p>
          <p className="mt-0.5 text-sm leading-snug text-white/60">{texto}</p>
        </li>
      ))}
    </ul>
  )
}

const destinoTras = (user, from) => {
  if (!user.terms_accepted_at) return RUTAS_INSTALAR.terminos
  // Un técnico nunca debe aterrizar en una ruta del ERP, ni el resto en la app de terreno.
  return from && from.startsWith(inicioDeRolApi(user.rolApi)) ? from : inicioDeRolApi(user.rolApi)
}

const MarcoLogin = ({ titulo, subtitulo, children }) => (
  <div className="w-full max-w-md">
    <div className="mb-8 lg:hidden"><BrandMark height={56} /></div>
    <h1 className="t-display text-[2.4rem] leading-none sm:text-[3rem]">{titulo}</h1>
    <p className="mt-3 text-ink-soft">{subtitulo}</p>
    <div className="mt-8">{children}</div>
  </div>
)

/** Ingreso real: correo y contraseña contra Django, luego código 2FA. No existe ningún acceso sin servidor. */
export function LoginPage() {
  const { user, aviso } = useAuthStore()
  const navigate = useNavigate()
  const from = useLocation().state?.from

  if (user) return <Navigate to={destinoTras(user, from)} replace />

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
          <Resumen />
        </div>
        <p className="relative text-sm text-white/45">Región de Ñuble, Chile</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <LoginFlow Marco={MarcoLogin} aviso={aviso} onListo={(u) => navigate(destinoTras(u, from), { replace: true })} />
      </main>
    </div>
  )
}
