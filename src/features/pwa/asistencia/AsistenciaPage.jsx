import { useEffect, useState } from 'react'
import { LogIn, LogOut, MapPin, MapPinOff, CloudOff, Satellite } from 'lucide-react'
import { Badge, Mono, Skeleton, cn } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { TIPOS_MARCA, horaDe, horasTrabajadas } from '@/domain/asistencia'
import { useAsistencia } from './useAsistencia'

const dos = (n) => String(n).padStart(2, '0')
const hhmmss = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
const fechaLarga = (d) => {
  const t = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return t[0].toUpperCase() + t.slice(1)
}

function useReloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

/** Reloj control: un solo botón que cambia entre «Marcar entrada» (verde) y «Marcar salida» (rojo). */
export function AsistenciaPage() {
  const user = useAuthStore((s) => s.user)
  const ahora = useReloj()
  const { cargando, marcas, siguiente, ultima, marcando, marcar } = useAsistencia()
  const entrada = siguiente === TIPOS_MARCA.ENTRADA
  const trabajadas = marcas.length ? horasTrabajadas(marcas, `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`) : 0

  return (
    <div className="space-y-5">
      <section className="instrument p-5 text-center">
        <div className="lattice pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative">
          <p className="text-sm text-white/65">{fechaLarga(ahora)}</p>
          <p className="t-display mt-1 text-[3.4rem] leading-none tabular-nums" aria-live="off">{hhmmss(ahora)}</p>
          <p className="mt-3 text-sm text-white/75">
            {cargando ? 'Consultando tu jornada…' : entrada
              ? ultima ? `Última salida a las ${horaDe(ultima.fecha)}` : `Hola, ${user.nombre.split(' ')[0]}. Aún no marcas hoy.`
              : `Entrada registrada a las ${horaDe(ultima.fecha)}${trabajadas ? ` · ${trabajadas} h trabajadas` : ''}`}
          </p>
        </div>
      </section>

      {cargando ? <div className="card"><Skeleton rows={2} /></div> : (
        <button
          type="button"
          onClick={() => marcar(siguiente)}
          disabled={marcando}
          className={cn(
            'flex h-24 w-full items-center justify-center gap-3 rounded-2xl text-xl font-semibold text-white shadow-lift transition-[transform,filter] duration-150 active:scale-[0.98] disabled:opacity-70',
            entrada ? 'bg-ok' : 'bg-crit',
          )}
        >
          {entrada ? <LogIn className="h-7 w-7" /> : <LogOut className="h-7 w-7" />}
          {marcando ? 'Registrando…' : entrada ? 'Marcar entrada' : 'Marcar salida'}
        </button>
      )}
      <p className="-mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
        <Satellite className="h-3.5 w-3.5" />Al marcar se guarda la hora y tu ubicación.
      </p>

      <section aria-label="Marcas de hoy">
        <h2 className="mb-2 text-sm font-semibold">Hoy</h2>
        {marcas.length === 0 ? (
          <p className="card p-4 text-sm text-ink-soft">Todavía no tienes marcas hoy.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {[...marcas].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3.5">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', m.tipo === TIPOS_MARCA.ENTRADA ? 'bg-ok-bg text-ok' : 'bg-crit-bg text-crit')}>
                  {m.tipo === TIPOS_MARCA.ENTRADA ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{m.tipo === TIPOS_MARCA.ENTRADA ? 'Entrada' : 'Salida'}</p>
                  <p className="truncate text-xs text-ink-soft">{m.obra_nombre ?? (m.enCola ? 'Esperando señal para enviarse' : 'Sin obra asignada')}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Mono className="text-sm font-semibold">{horaDe(m.fecha)}</Mono>
                  {m.enCola ? <Badge tone="warn" icon={CloudOff}>En cola</Badge>
                    : m.geocerca && (m.geocerca.dentro
                      ? <Badge tone="ok" icon={MapPin}>En la obra</Badge>
                      : <Badge tone="crit" icon={MapPinOff}>Fuera · {m.geocerca.distanciaM} m</Badge>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
