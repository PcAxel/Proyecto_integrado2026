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
    if (res.enviados) toast.success(`${res.enviados} registro(s) sincronizado(s)`)
    if (res.errores) toast.error(`${res.errores} registro(s) rechazado(s) por el servidor`)
    if (!res.enviados && !res.errores) toast.info(res.pendientes ? 'No se pudo conectar. Se reintentará.' : 'Todo está sincronizado.')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Sincronización</h1>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${online ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}>{online ? <Wifi className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}</span>
            <div><p className="text-sm font-semibold">{online ? 'En línea' : 'Modo sin señal'}</p><p className="text-xs text-ink-soft">{ultimoSync ? <>Último sync: <Mono>{formatFechaHora(ultimoSync)}</Mono></> : 'Sin sincronizaciones aún'}</p></div>
          </div>
          <Badge tone={r.pendientes ? 'warn' : 'ok'}>{r.pendientes} pendiente(s)</Badge>
        </div>
        <Button size="lg" className="mt-4 w-full" icon={RefreshCw} loading={sincronizando} disabled={!online || r.pendientes === 0} onClick={sincronizar}>Sincronizar ahora</Button>
        {!online && <p className="mt-2 text-center text-xs text-warn">Sin señal: se enviará automáticamente al reconectar.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Cola de envío</h2>
        {pendientes.length === 0 && <div className="card"><EmptyState icon={CheckCircle2} title="Nada pendiente" hint="Los registros creados sin señal aparecerán aquí hasta enviarse." /></div>}
        {pendientes.map((it) => {
          const Icono = ICONO[it.tipo]
          return (
            <div key={it.id} className="card p-3">
              <div className="flex items-start gap-3">
                <Icono className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{TITULO[it.tipo]}</p>
                  <p className="truncate text-xs text-ink-soft">{it.obra_nombre}</p>
                  <Mono className="text-[11px] text-ink-faint">{formatFechaHora(it.creadoEn)}{it.intentos > 0 && ` · ${it.intentos} intento(s)`}</Mono>
                </div>
                <Badge tone={it.estado === 'ERROR' ? 'crit' : 'warn'} icon={it.estado === 'ERROR' ? AlertCircle : CloudOff}>{it.estado === 'ERROR' ? 'Rechazado' : 'Pendiente'}</Badge>
              </div>
              {it.estado === 'ERROR' && (
                <div className="mt-3 space-y-2">
                  <p className="rounded-lg bg-crit-bg p-2 text-xs text-crit">{it.error}</p>
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
        <h2 className="text-sm font-semibold">Opciones de demostración</h2>
        <Button variant="secondary" size="lg" className="w-full" icon={online ? CloudOff : Wifi} onClick={() => setOnline(!online)}>{online ? 'Simular modo sin señal' : 'Recuperar señal'}</Button>
        <Select label="Posición GPS" value={gpsModo} onChange={(e) => setGpsModo(e.target.value)}
          options={[{ value: 'REAL', label: 'Dispositivo (si no hay GPS, simulada en obra)' }, { value: 'DENTRO', label: 'Simular dentro de la geocerca' }, { value: 'FUERA', label: 'Simular fuera de la geocerca' }]} />
      </section>
    </div>
  )
}
