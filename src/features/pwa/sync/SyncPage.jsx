import { RefreshCw, CloudOff, CheckCircle2, AlertCircle, ClipboardList, PackageOpen, Wifi, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Badge, Mono, Select, EmptyState } from '@/components/ui'
import { useSyncStore } from '@/stores/syncStore'
import { procesarCola, descartarDeCola, reintentarItem } from '@/services'
import { resumenCola } from '@/domain/sync'
import { formatFechaHora } from '@/domain/format'

const ICONO = { HOJA: ClipboardList, RETIRO: PackageOpen, ASISTENCIA: Clock }
const TITULO = { HOJA: 'Hoja de servicio', RETIRO: 'Solicitud de materiales', ASISTENCIA: 'Marca de asistencia' }

export function SyncPage() {
  const { online, setOnline, pendientes, ultimoSync, sincronizando, gpsModo, setGpsModo } = useSyncStore()
  const r = resumenCola(pendientes)

  const sincronizar = async () => {
    const res = await procesarCola()
    if (res.enviados) toast.success(`${res.enviados} registro(s) enviado(s)`)
    if (res.errores) toast.error(`${res.errores} registro(s) rechazado(s) por el servidor`)
    if (!res.enviados && !res.errores) toast.info(res.pendientes ? 'No se pudo conectar. Se reintentará.' : 'Todo está enviado.')
  }

  return (
    <div className="space-y-5">
      <section className={`rounded-3xl p-5 text-center ${r.pendientes ? 'bg-harvest-bg' : 'bg-ok-bg'}`}>
        <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white ${r.pendientes ? 'text-warn' : 'text-ok'}`}>{r.pendientes ? <CloudOff className="h-9 w-9" /> : <CheckCircle2 className="h-9 w-9" />}</span>
        <p className="t-display mt-3 text-[2rem] leading-none">{r.pendientes ? `${r.pendientes} por enviar` : 'Todo enviado'}</p>
        <p className="mt-2 text-base text-ink-soft">{online ? (ultimoSync ? <>Último envío: <Mono>{formatFechaHora(ultimoSync)}</Mono></> : 'Aún no se ha enviado nada') : 'Sin señal: se enviará solo cuando vuelva.'}</p>
        <Button size="lg" className="mt-4 !h-16 w-full !text-xl font-bold" icon={RefreshCw} loading={sincronizando} disabled={!online || r.pendientes === 0} onClick={sincronizar}>Enviar ahora</Button>
      </section>

      <section className="space-y-2">
        <h2 className="t-display text-[1.5rem] text-ink">Lo que falta enviar</h2>
        {pendientes.length === 0 && <div className="card"><EmptyState icon={CheckCircle2} title="No falta nada" hint="Lo que guardes sin señal aparecerá aquí hasta que se envíe." /></div>}
        {pendientes.map((it) => {
          const Icono = ICONO[it.tipo]
          return (
            <div key={it.id} className="card p-3">
              <div className="flex items-start gap-3">
                <Icono className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{TITULO[it.tipo]}</p>
                  <p className="truncate text-sm text-ink-soft">{it.obra_nombre}</p>
                  <Mono className="text-sm text-ink-faint">{formatFechaHora(it.creadoEn)}{it.intentos > 0 && ` · ${it.intentos} intento(s)`}</Mono>
                </div>
                <Badge tone={it.estado === 'ERROR' ? 'crit' : 'warn'} icon={it.estado === 'ERROR' ? AlertCircle : CloudOff}>{it.estado === 'ERROR' ? 'Rechazado' : 'Pendiente'}</Badge>
              </div>
              {it.estado === 'ERROR' && (
                <div className="mt-3 space-y-2">
                  <p className="rounded-lg bg-crit-bg p-2 text-sm text-crit">{it.error}</p>
                  <div className="flex gap-2">
                    <Button size="md" variant="secondary" className="flex-1" onClick={() => reintentarItem(it.id)}>Reintentar</Button>
                    <Button size="md" variant="ghost" className="flex-1" onClick={() => descartarDeCola(it.id)}>Descartar</Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-base font-semibold text-ink-soft">Solo para la demostración</h2>
        <Button variant="secondary" size="lg" className="w-full" icon={online ? CloudOff : Wifi} onClick={() => setOnline(!online)}>{online ? 'Simular modo sin señal' : 'Recuperar señal'}</Button>
        <Select label="Posición GPS" value={gpsModo} onChange={(e) => setGpsModo(e.target.value)}
          options={[{ value: 'REAL', label: 'Dispositivo (si no hay GPS, simulada en obra)' }, { value: 'DENTRO', label: 'Simular dentro de la geocerca' }, { value: 'FUERA', label: 'Simular fuera de la geocerca' }]} />
      </section>
    </div>
  )
}
