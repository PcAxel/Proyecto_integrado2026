import { useState } from 'react'
import { Send, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Select, Textarea, Badge, Mono } from '@/components/ui'
import { articulosService, obrasService, retirosService, enviarOEncolar } from '@/services'
import { useSyncStore } from '@/stores/syncStore'
import { useResource } from '@/hooks/useResource'
import { formatFechaHora } from '@/domain/format'
import { MaterialPicker } from '../MaterialPicker'

const TONO = { PENDIENTE: 'warn', ENTREGADA: 'ok', RECHAZADA: 'crit' }

/** Solicitud de materiales en terreno. Sin señal se guarda en la cola y se envía al reconectar. */
export function RetiroPage() {
  const online = useSyncStore((s) => s.online)
  const [obraId, setObraId] = useState('')
  const [lineas, setLineas] = useState([])
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)

  const obras = useResource(() => obrasService.list({ estado: 'EN_CURSO' }), [])
  const catalogo = useResource(() => articulosService.catalogo(), [])
  const mias = useResource(() => retirosService.list(), [])

  const enviar = async () => {
    setEnviando(true)
    try {
      const obra = obras.data?.find((o) => o.id === obraId)
      const r = await enviarOEncolar('RETIRO', {
        obra_id: obraId, observaciones: obs, items: lineas.map((l) => ({ articulo_id: l.articulo.id, cantidad: l.cantidad })),
      }, { obra_nombre: obra?.nombre })
      if (r.encolado) toast.info('Sin señal: solicitud guardada. Se enviará al reconectar.')
      else toast.success('Solicitud enviada a Bodega')
      setLineas([])
      setObs('')
      mias.reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Retiro de materiales</h1>
      <Select size="lg" label="Obra" placeholder="Seleccione la obra…" value={obraId} onChange={(e) => setObraId(e.target.value)}
        options={(obras.data ?? []).map((o) => ({ value: o.id, label: `${o.id} · ${o.nombre}` }))} />
      <MaterialPicker catalogo={catalogo.data ?? []} lineas={lineas} onChange={setLineas} />
      <Textarea label="Observaciones (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
      {!online && (
        <p className="flex items-center gap-2 rounded-lg bg-warn-bg p-3 text-xs text-warn"><WifiOff className="h-4 w-4 shrink-0" />Sin señal: la solicitud quedará en la cola y se enviará sola al reconectar.</p>
      )}
      <Button size="lg" className="w-full" icon={Send} onClick={enviar} loading={enviando} disabled={!obraId || lineas.length === 0}>{online ? 'Enviar solicitud' : 'Guardar para enviar'}</Button>

      <section className="space-y-2 pt-2">
        <h2 className="text-sm font-semibold">Mis solicitudes</h2>
        {(mias.data ?? []).length === 0 && <p className="text-xs text-ink-soft">Aún no has enviado solicitudes.</p>}
        {(mias.data ?? []).map((r) => (
          <div key={r.id} className="card p-3 text-sm">
            <div className="flex items-center justify-between"><Mono className="font-medium">{r.id}</Mono><Badge tone={TONO[r.estado]}>{r.estado.charAt(0) + r.estado.slice(1).toLowerCase()}</Badge></div>
            <p className="mt-1 text-xs text-ink-soft">{r.obra_nombre}</p>
            <p className="mt-1 text-xs">{r.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(' · ')}</p>
            {r.motivo_rechazo && <p className="mt-1 text-xs text-crit">{r.motivo_rechazo}</p>}
            <Mono className="mt-1 block text-[11px] text-ink-faint">{formatFechaHora(r.fecha)}</Mono>
          </div>
        ))}
      </section>
    </div>
  )
}
