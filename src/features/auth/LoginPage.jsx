import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { inicioDeRolApi } from '@/domain/rolesApi'
import { RUTAS_INSTALAR } from '@/domain/instalacion'
import { LoginFlow } from './LoginFlow'

const destinoTras = (user, from) => {
  if (!user.terms_accepted_at) return RUTAS_INSTALAR.terminos
  // Un técnico nunca debe aterrizar en una ruta del ERP, ni el resto en la app de terreno.
  return from && from.startsWith(inicioDeRolApi(user.rolApi)) ? from : inicioDeRolApi(user.rolApi)
}

const Logo = () => <img src="/logo-fyag.png" alt="Frío y Agroindustria SpA" className="h-9 w-9 shrink-0 select-none rounded-lg bg-white/95 object-contain p-1" draggable={false} />

// Los campos y botones vienen de LoginFlow (compartido con /instalar): aquí se tiñen desde el contenedor, sin tocar su lógica.
const TEMA_FORMULARIO = [
  '[&_label>span:first-child]:text-fyag-ice/80',
  '[&_input]:h-auto [&_input]:rounded-lg [&_input]:border-fyag-teal/50 [&_input]:bg-fyag-bg [&_input]:px-3.5 [&_input]:py-2 [&_input]:text-sm [&_input]:text-fyag-cream [&_input]:placeholder-fyag-ice/40 [&_input]:outline-none [&_input]:transition [&_input:focus]:border-fyag-ice [&_input:focus]:ring-0',
  '[&_button[type=submit]]:!h-auto [&_button[type=submit]]:!rounded-lg [&_button[type=submit]]:!bg-fyag-orange [&_button[type=submit]]:!py-2.5 [&_button[type=submit]]:!text-sm [&_button[type=submit]]:!text-fyag-cream [&_button[type=submit]]:!shadow-lg [&_button[type=submit]]:!shadow-fyag-orange/20 [&_button[type=submit]:hover]:!bg-[#b05218] [&_button[type=submit]:disabled]:!opacity-50',
  '[&_button:not([type=submit])]:!text-fyag-ice [&_button:not([type=submit]):hover]:!bg-fyag-deep/30',
  '[&_[role=alert]]:!text-fyag-orange [&_[role=status]]:!bg-fyag-orange/10 [&_[role=status]]:!text-fyag-orange',
  '[&_li>p]:!text-fyag-cream',
].join(' ')

const MarcoLogin = ({ titulo, subtitulo, children }) => (
  <div className={`w-full max-w-sm rounded-2xl border border-fyag-ice/15 bg-fyag-panel p-8 shadow-2xl ${TEMA_FORMULARIO}`}>
    <div className="mb-6 lg:hidden"><Logo /></div>
    <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fyag-cream">{titulo}</h1>
    <p className="mt-2 text-sm text-fyag-ice">{subtitulo}</p>
    <div className="mt-6">{children}</div>
  </div>
)

/** Ingreso real: correo y contraseña contra Django, luego código 2FA. No existe ningún acceso sin servidor. */
export function LoginPage() {
  const { user, aviso } = useAuthStore()
  const navigate = useNavigate()
  const from = useLocation().state?.from

  if (user) return <Navigate to={destinoTras(user, from)} replace />

  return (
    <div className="grid min-h-screen bg-fyag-bg text-fyag-cream lg:grid-cols-12">
      <aside className="hidden flex-col justify-between border-r border-fyag-ice/10 bg-gradient-to-b from-fyag-deep/35 via-fyag-bg to-fyag-bg p-10 lg:col-span-7 lg:flex lg:p-16">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-xs uppercase tracking-widest text-fyag-ice">Frío y Agroindustria SpA · Sur de Chile</span>
        </div>
        <div>
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-fyag-cream lg:text-4xl">Precisión térmica e innovación para la agroindustria.</h2>
          <p className="mt-3 max-w-xl text-sm text-fyag-ice">Plataforma integral de control operativo, trazabilidad de bodega y asistencia técnica en terreno.</p>
          <div className="mt-8 grid max-w-2xl gap-4">
            <section className="rounded-xl border border-fyag-ice/15 bg-fyag-deep/20 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fyag-orange">Nuestra Misión</h3>
              <p className="mt-2 text-sm leading-relaxed text-fyag-cream/90">Ofrecer soluciones tecnológicas integrales en refrigeración industrial y climatización en Ñuble, Biobío y La Araucanía, optimizando procesos productivos, asegurando la cadena de frío y garantizando la máxima conservación para nuestros clientes.</p>
            </section>
            <section className="rounded-xl border border-fyag-ice/15 bg-fyag-deep/20 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fyag-ice">Nuestra Visión</h3>
              <p className="mt-2 text-sm leading-relaxed text-fyag-cream/90">Consolidarnos como el referente tecnológico en sistemas de control térmico para una agroindustria moderna y competitiva, siendo un socio estratégico de largo plazo mediante innovación en tiempo real y excelencia técnica.</p>
            </section>
          </div>
        </div>
        <p className="text-xs text-fyag-ice/60">Región de Ñuble, Biobío y La Araucanía · Chile</p>
      </aside>
      <main className="flex items-center justify-center bg-fyag-bg p-8 lg:col-span-5">
        <LoginFlow Marco={MarcoLogin} aviso={aviso} onListo={(u) => navigate(destinoTras(u, from), { replace: true })} />
      </main>
    </div>
  )
}
