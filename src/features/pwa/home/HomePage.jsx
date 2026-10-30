import { Link } from 'react-router-dom'
import { HardHat, MapPin, ClipboardList, PackageOpen, CheckCircle2, CloudOff, LogIn, LogOut, ChevronRight } from 'lucide-react'
import { Badge, Mono, EmptyState, Skeleton, cn } from '@/components/ui'
import { TIPO_OBRA_LABEL, EmergencyBadge } from '@/components/domain'
import { obrasService, hojasService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { useResource } from '@/hooks/useResource'
import { fechaLocal } from '@/domain/format'
import { horaDe, TIPOS_MARCA } from '@/domain/asistencia'
import { useAsistencia } from '../asistencia/useAsistencia'

/** Acceso destacado al reloj control: dice qué marca toca ahora y lleva a la pantalla de asistencia. */
function TarjetaAsistencia() {
  const { cargando, siguiente, ultima } = useAsistencia()
  if (cargando) return <div className="card h-[72px] animate-pulse" aria-hidden="true" />
  const entrada = siguiente === TIPOS_MARCA.ENTRADA
  return (
    <Link to="/app/asistencia" className="card flex items-center gap-3 p-3.5 active:bg-slate-50">
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white', entrada ? 'bg-ok' : 'bg-crit')}>
        {entrada ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{entrada ? 'Marcar entrada' : 'Marcar salida'}</span>
        <span className="block truncate text-xs text-ink-soft">{ultima ? `${ultima.tipo === TIPOS_MARCA.ENTRADA ? 'Entrada' : 'Salida'} a las ${horaDe(ultima.fecha)}` : 'Aún no marcas hoy'}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-ink-faint" />
    </Link>
  )
}

/** "Mis obras de hoy": solo las obras en curso donde el técnico está asignado (el servicio filtra por su ficha). */
export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const pendientes = useSyncStore((s) => s.pendientes)
  const obras = useResource(() => obrasService.list({ estado: 'EN_CURSO' }), [])
  const hojas = useResource(() => hojasService.list(), [])
  const hoy = fechaLocal()
  const enviadaHoy = (obraId) => (hojas.data ?? []).some((h) => h.obra_id === obraId && h.fecha.startsWith(hoy))
  const enCola = (obraId) => pendientes.filter((p) => p.tipo === 'HOJA' && p.obra_id === obraId).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Mis obras de hoy</h1>
        <p className="text-xs text-ink-soft">Hola, {user.nombre.split(' ')[0]}</p>
      </div>

      <TarjetaAsistencia />

      {!obras.data && <div className="card"><Skeleton rows={4} /></div>}
      {obras.data?.length === 0 && <div className="card"><EmptyState icon={HardHat} title="Sin obras asignadas" hint="Cuando el supervisor te asigne una obra en curso aparecerá aquí." /></div>}

      {obras.data?.map((o) => (
        <article key={o.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{o.nombre}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft"><MapPin className="h-3 w-3" />{o.ubicacion.direccion}, {o.ubicacion.comuna}</p>
            </div>
            <Mono className="shrink-0 text-[11px] text-ink-faint">{o.id}</Mono>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="info">{TIPO_OBRA_LABEL[o.tipo]}</Badge>
            {o.es_emergencia_sin_presupuesto && <EmergencyBadge />}
            {enviadaHoy(o.id) && <Badge tone="ok" icon={CheckCircle2}>Hoja enviada hoy</Badge>}
            {enCola(o.id) > 0 && <Badge tone="warn" icon={CloudOff}>{enCola(o.id)} en cola</Badge>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/app/hoja-servicio?obra=${o.id}`} className="flex h-14 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white active:bg-brand-dark"><ClipboardList className="h-5 w-5" />Hoja de servicio</Link>
            <Link to="/app/retiro" className="flex h-14 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold active:bg-slate-50"><PackageOpen className="h-5 w-5" />Pedir materiales</Link>
          </div>
        </article>
      ))}
    </div>
  )
}
