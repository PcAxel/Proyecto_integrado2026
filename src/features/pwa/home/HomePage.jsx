import { Link } from 'react-router-dom'
import { MapPin, ClipboardList, PackageOpen, CheckCircle2, CloudOff, LogIn, LogOut, Send, HardHat } from 'lucide-react'
import { Skeleton, cn } from '@/components/ui'
import { obrasService, hojasService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { useResource } from '@/hooks/useResource'
import { fechaLocal } from '@/domain/format'
import { horaDe, TIPOS_MARCA } from '@/domain/asistencia'
import { useAsistencia } from '../asistencia/useAsistencia'

const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

/** Botón grande del menú: un color por tarea, un ícono y una frase que dice qué pasa al tocarlo. */
function Opcion({ to, icon: Icon, titulo, ayuda, clases, cargando }) {
  if (cargando) return <div className="h-[104px] animate-pulse rounded-3xl bg-slate-200" aria-hidden="true" />
  return (
    <Link to={to} className={cn('flex min-h-[104px] items-center gap-4 rounded-3xl p-4 shadow-lift transition-transform active:scale-[0.98]', clases)}>
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/25"><Icon className="h-9 w-9" strokeWidth={2.2} /></span>
      <span className="min-w-0 flex-1">
        <span className="t-display block text-[1.7rem] leading-none">{titulo}</span>
        <span className="mt-1.5 block text-[15px] leading-snug opacity-90">{ayuda}</span>
      </span>
    </Link>
  )
}

/** Inicio del técnico: cuatro botones grandes y, debajo, las obras donde está asignado. */
export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const pendientes = useSyncStore((s) => s.pendientes)
  const obras = useResource(() => obrasService.list({ estado: 'EN_CURSO' }), [])
  const hojas = useResource(() => hojasService.list(), [])
  const { cargando, siguiente, ultima } = useAsistencia()
  const hoy = fechaLocal()
  const enviadaHoy = (obraId) => (hojas.data ?? []).some((h) => h.obra_id === obraId && h.fecha.startsWith(hoy))
  const enCola = (obraId) => pendientes.filter((p) => p.tipo === 'HOJA' && p.obra_id === obraId).length
  const entrada = siguiente === TIPOS_MARCA.ENTRADA

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg text-ink-soft">{saludo()},</p>
        <h1 className="t-display text-[2.4rem] leading-none text-ink">{user.nombre.split(' ')[0]}</h1>
      </div>

      <div className="space-y-3.5">
        <Opcion
          to="/app/asistencia"
          cargando={cargando}
          icon={entrada ? LogIn : LogOut}
          titulo={entrada ? 'Marcar entrada' : 'Marcar salida'}
          ayuda={ultima ? `${ultima.tipo === TIPOS_MARCA.ENTRADA ? 'Entraste' : 'Saliste'} a las ${horaDe(ultima.fecha)}` : 'Todavía no marcas hoy'}
          clases={entrada ? 'bg-ok text-white' : 'bg-crit text-white'}
        />
        <Opcion to="/app/hoja-servicio" icon={ClipboardList} titulo="Hoja de servicio" ayuda="Cuenta lo que hiciste hoy" clases="bg-brand-dark text-white" />
        <Opcion to="/app/retiro" icon={PackageOpen} titulo="Pedir materiales" ayuda="Pide lo que necesitas a Bodega" clases="bg-harvest text-deep" />
        <Opcion
          to="/app/sync"
          icon={pendientes.length ? CloudOff : Send}
          titulo="Envíos pendientes"
          ayuda={pendientes.length ? `${pendientes.length} por enviar` : 'Todo enviado'}
          clases="bg-deep text-white"
        />
      </div>

      <section aria-label="Mis obras" className="space-y-3 pt-1">
        <h2 className="t-display text-[1.5rem] text-ink">Mis obras de hoy</h2>
        {!obras.data && <div className="rounded-2xl bg-white p-4"><Skeleton rows={3} /></div>}
        {obras.data?.length === 0 && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-line-strong bg-white p-4">
            <HardHat className="mt-0.5 h-7 w-7 shrink-0 text-ink-faint" />
            <p className="text-base leading-snug text-ink-soft">Todavía no tienes obras asignadas. Cuando el supervisor te asigne una, aparecerá aquí.</p>
          </div>
        )}
        {obras.data?.map((o) => (
          <article key={o.id} className="rounded-2xl border-2 border-line-strong bg-white p-4">
            <h3 className="text-lg font-bold leading-snug text-ink">{o.nombre}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-base text-ink-soft"><MapPin className="mt-0.5 h-5 w-5 shrink-0" />{o.ubicacion.direccion}, {o.ubicacion.comuna}</p>
            {(enviadaHoy(o.id) || enCola(o.id) > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {enviadaHoy(o.id) && <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-3 py-1.5 text-[15px] font-semibold text-ok"><CheckCircle2 className="h-5 w-5" />Hoja enviada hoy</span>}
                {enCola(o.id) > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-3 py-1.5 text-[15px] font-semibold text-warn"><CloudOff className="h-5 w-5" />Por enviar</span>}
              </div>
            )}
            <Link to={`/app/hoja-servicio?obra=${o.id}`} className="mt-4 flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-brand-dark text-lg font-bold text-brand-dark active:bg-brand-tint">
              <ClipboardList className="h-6 w-6" />Hoja de esta obra
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
