import { useEffect, useState } from 'react'
import { LogIn, LogOut, MapPin, MapPinOff, CloudOff, Satellite } from 'lucide-react'
import { Mono, cn } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { TIPOS_MARCA, horaDe, segundosCerrados } from '@/domain/asistencia'
import { formatFecha } from '@/domain/format'
import { useAsistencia } from './useAsistencia'

const dos = (n) => String(n).padStart(2, '0')
const hms = (seg) => `${dos(Math.floor(seg / 3600))}:${dos(Math.floor((seg % 3600) / 60))}:${dos(Math.floor(seg % 60))}`
const fechaLarga = (d) => {
  const t = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return t[0].toUpperCase() + t.slice(1)
}
const duracion = (seg) => `${Math.floor(seg / 3600)} h ${dos(Math.floor((seg % 3600) / 60))} min`

/** Cronómetro de la jornada: corre SOLO mientras hay una entrada sin salida. Sin jornada abierta no avanza. */
function useCronometro(activo) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    setAhora(new Date())
    if (!activo) return undefined
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [activo])
  return ahora
}

/**
 * Reloj control. El cronómetro empieza al marcar la ENTRADA y se detiene al marcar la SALIDA; esa marca es la que
 * deja registrada la jornada como asistencia. Un solo botón alterna «Marcar entrada» (verde) y «Marcar salida» (rojo).
 */
export function AsistenciaPage() {
  const user = useAuthStore((s) => s.user)
  const { cargando, marcas, siguiente, ultima, marcando, marcar, sinSalidaPrevia } = useAsistencia()
  const abierta = !cargando && ultima?.tipo === TIPOS_MARCA.ENTRADA
  const ahora = useCronometro(abierta)
  const entrada = siguiente === TIPOS_MARCA.ENTRADA
  const cerrados = segundosCerrados(marcas) // solo tramos con entrada y salida
  const corriendo = abierta ? Math.max(0, Math.floor((ahora - new Date(ultima.fecha)) / 1000)) : 0

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border-2 border-line-strong bg-white p-5 text-center">
        <p className="text-lg text-ink-soft">{fechaLarga(ahora)}</p>
        <p className={cn('t-display mt-1 text-[4.2rem] leading-none tabular-nums', abierta ? 'text-ok' : 'text-ink-faint')} aria-live="off" aria-label="Tiempo de la jornada">
          {hms(cerrados + corriendo)}
        </p>
        <p className="mt-3 text-lg leading-snug text-ink">
          {cargando ? 'Revisando tu jornada…'
            : abierta ? `Entraste a las ${horaDe(ultima.fecha)}. El tiempo corre hasta que marques tu salida.`
              : ultima ? `Saliste a las ${horaDe(ultima.fecha)} · trabajaste ${duracion(cerrados)} hoy`
                : `Hola, ${user.nombre.split(' ')[0]}. El tiempo empieza a correr cuando marques tu entrada.`}
        </p>
        {abierta && <p className="mt-1 text-base text-ink-soft">La jornada queda registrada como asistencia al marcar la salida.</p>}
      </section>
      {sinSalidaPrevia && (
        <p role="alert" className="rounded-2xl bg-warn-bg p-4 text-base font-semibold text-warn">
          No marcaste salida el {formatFecha(sinSalidaPrevia.fecha)}: esa jornada no suma horas. Avisa a Recursos Humanos para regularizarla.
        </p>
      )}

      {cargando ? <div className="h-32 animate-pulse rounded-3xl bg-slate-200" /> : (
        <button
          type="button"
          onClick={() => marcar(siguiente)}
          disabled={marcando}
          className={cn(
            'flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-3xl text-white shadow-lift transition-transform active:scale-[0.98] disabled:opacity-70',
            entrada ? 'bg-ok' : 'bg-crit',
          )}
        >
          {entrada ? <LogIn className="h-11 w-11" strokeWidth={2.2} /> : <LogOut className="h-11 w-11" strokeWidth={2.2} />}
          <span className="t-display text-[2.2rem] leading-none">{marcando ? 'Guardando…' : entrada ? 'Marcar entrada' : 'Marcar salida'}</span>
        </button>
      )}
      <p className="flex items-center justify-center gap-2 text-center text-base text-ink-soft">
        <Satellite className="h-5 w-5 shrink-0" />Al marcar se guarda la hora y tu ubicación real.
      </p>

      <section aria-label="Marcas de hoy" className="space-y-2">
        <h2 className="t-display text-[1.5rem] text-ink">Lo que marcaste hoy</h2>
        {marcas.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line-strong bg-white p-4 text-base text-ink-soft">Todavía no has marcado nada hoy.</p>
        ) : (
          <ul className="space-y-2">
            {[...marcas].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl border-2 border-line-strong bg-white p-3.5">
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', m.tipo === TIPOS_MARCA.ENTRADA ? 'bg-ok-bg text-ok' : 'bg-crit-bg text-crit')}>
                  {m.tipo === TIPOS_MARCA.ENTRADA ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">{m.tipo === TIPOS_MARCA.ENTRADA ? 'Entrada' : 'Salida'} · <Mono>{horaDe(m.fecha)}</Mono></p>
                  <p className="text-[15px] text-ink-soft">{m.obra_nombre ?? (m.enCola ? 'Esperando señal para enviarse' : 'Sin obra asignada')}</p>
                  {m.enCola ? <span className="mt-1 inline-flex items-center gap-1 text-[15px] font-semibold text-warn"><CloudOff className="h-4 w-4" />Por enviar</span>
                    : m.geocerca && (m.geocerca.dentro
                      ? <span className="mt-1 inline-flex items-center gap-1 text-[15px] font-semibold text-ok"><MapPin className="h-4 w-4" />Estabas en la obra</span>
                      : <span className="mt-1 inline-flex items-center gap-1 text-[15px] font-semibold text-crit"><MapPinOff className="h-4 w-4" />Lejos de la obra ({m.geocerca.distanciaM} m)</span>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
