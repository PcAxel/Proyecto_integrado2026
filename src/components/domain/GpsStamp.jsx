import { MapPin } from 'lucide-react'
import { Mono, cn } from '@/components/ui'
import { formatFechaHora } from '@/domain/format'

/** Sello GPS de una foto: coordenadas, hora y resultado de la geocerca. */
export function GpsStamp({ lat, lng, ts, geocerca, simulado, className }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-[11px]', className)}>
      <MapPin className={cn('h-3 w-3 shrink-0', geocerca ? (geocerca.dentro ? 'text-ok' : 'text-crit') : 'text-ink-faint')} />
      <Mono className="truncate">{lat.toFixed(5)}, {lng.toFixed(5)}</Mono>
      {ts && <Mono className="text-ink-faint">· {formatFechaHora(ts)}</Mono>}
      {geocerca && <span className={geocerca.dentro ? 'text-ok' : 'font-semibold text-crit'}>{geocerca.dentro ? 'Dentro' : `Fuera ${geocerca.distanciaM} m`}</span>}
      {simulado && <span className="text-ink-faint">(simulado)</span>}
    </div>
  )
}
