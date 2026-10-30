import { Link } from 'react-router-dom'
import { Manometro } from '@/components/domain'
import { botonClases } from '@/components/ui'
import { can } from '@/domain/rbac'
import { saludoDeLaHora } from './enfoques'

const fechaLarga = () => {
  const f = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return f[0].toUpperCase() + f.slice(1)
}

/**
 * Panel de instrumentos: lo primero que ve cada persona. Titular y accesos según su rol,
 * y un manómetro con el indicador que más le importa.
 */
export function PanelInstrumentos({ usuario, titular, apoyo, accesos, instrumento }) {
  const botones = accesos.filter(([, , accion]) => can(usuario.rol, accion))
  return (
    <section className="instrument p-6 sm:p-8 lg:p-10">
      <div className="lattice pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className={`relative grid items-center gap-8 ${instrumento ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : ''}`}>
        <div>
          <p className="text-sm text-white/65">{saludoDeLaHora()}, {usuario.nombre.split(' ')[0]}. {fechaLarga()}</p>
          <h1 className="t-display mt-3 text-[2.5rem] leading-[1.02] sm:text-[3.3rem] xl:text-[3.9rem]">{titular}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{apoyo}</p>
          {botones.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-3">
              {botones.map(([etiqueta, ruta], i) => (
                <Link key={ruta} to={ruta} className={botonClases(i === 0 ? 'light' : 'inverse', 'md')}>{etiqueta}</Link>
              ))}
            </div>
          )}
        </div>
        {instrumento && (
          <figure className="mx-auto w-full max-w-[23rem]">
            <Manometro valor={instrumento.valor} max={instrumento.max} marcas={instrumento.marcas} bandas={instrumento.bandas} texto={instrumento.texto} etiqueta={instrumento.etiqueta} />
            <figcaption className="-mt-1 text-center text-sm text-white/65">{instrumento.pie}</figcaption>
          </figure>
        )}
      </div>
    </section>
  )
}
