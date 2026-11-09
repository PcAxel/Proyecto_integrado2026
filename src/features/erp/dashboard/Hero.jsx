import { Link } from 'react-router-dom'
import { Manometro } from '@/components/domain'
import { can } from '@/domain/rbac'
import { useTemaStore } from '@/stores/temaStore'
import { saludoDeLaHora } from './enfoques'

const BOTON_BASE = 'inline-flex h-10 select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150'
const BOTON_CTA = `${BOTON_BASE} bg-fyag-orange text-[#EADCC8] hover:bg-fyag-orange/90`
const BOTON_SECUNDARIO = `${BOTON_BASE} border border-fyag-ice/20 text-fyag-cream hover:bg-fyag-deep/40`

const fechaLarga = () => {
  const f = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return f[0].toUpperCase() + f.slice(1)
}

/**
 * Panel de instrumentos: lo primero que ve cada persona. Titular y accesos según su rol,
 * y un manómetro con el indicador que más le importa.
 */
export function PanelInstrumentos({ usuario, titular, apoyo, accesos, instrumento }) {
  const tema = useTemaStore((s) => s.tema)
  const botones = accesos.filter(([, , accion]) => can(usuario.rol, accion))
  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl border border-fyag-teal/40 bg-gradient-to-br from-fyag-deep/40 via-fyag-panel to-fyag-bg p-6 sm:p-8">
      <div className={`relative grid items-center gap-8 ${instrumento ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : ''}`}>
        <div>
          <p className="text-sm text-fyag-ice/80">{saludoDeLaHora()}, {usuario.nombre.split(' ')[0]}. {fechaLarga()}</p>
          <h1 className="t-display mt-3 text-[2.25rem] leading-[1.05] text-fyag-cream sm:text-[2.9rem] xl:text-[3.3rem]">{titular}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fyag-ice/80 sm:text-lg">{apoyo}</p>
          {botones.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-3">
              {botones.map(([etiqueta, ruta], i) => (
                <Link key={ruta} to={ruta} className={i === 0 ? BOTON_CTA : BOTON_SECUNDARIO}>{etiqueta}</Link>
              ))}
            </div>
          )}
        </div>
        {instrumento && (
          <figure className="mx-auto w-full max-w-[23rem]">
            <Manometro tema={tema === 'claro' ? 'claro' : 'oscuro'} valor={instrumento.valor} max={instrumento.max} marcas={instrumento.marcas} bandas={instrumento.bandas} texto={instrumento.texto} etiqueta={instrumento.etiqueta} />
            <figcaption className="-mt-1 text-center text-sm text-fyag-ice/80">{instrumento.pie}</figcaption>
          </figure>
        )}
      </div>
    </section>
  )
}
