import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Card, DataTable, Badge, Drawer, Button, ConfirmDialog, Modal, Textarea, Mono } from '@/components/ui'
import { retirosService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { runAction } from '@/hooks/runAction'

export const ESTADO_RETIRO = {
  PENDIENTE: { tone: 'warn', label: 'Pendiente' },
  ENTREGADA: { tone: 'ok', label: 'Entregada' },
  RECHAZADA: { tone: 'crit', label: 'Rechazada' },
}

export function SolicitudesTab({ resource }) {
  const rol = useAuthStore((s) => s.user.rol)
  const { data, loading, reload } = resource
  const [sel, setSel] = useState(null)
  const [confirmar, setConfirmar] = useState(false)
  const [rechazo, setRechazo] = useState(null) // string | null
  const [trabajando, setTrabajando] = useState(false)
  const actual = sel && (data ?? []).find((r) => r.id === sel)
  const puede = can(rol, 'cardex.crear')

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha', mono: true, render: (r) => formatFechaHora(r.fecha) },
    { key: 'obra', header: 'Obra', render: (r) => <div><p className="font-medium">{r.obra_nombre}</p><Mono className="text-xs text-ink-soft">{r.obra_id}</Mono></div> },
    { key: 'tecnico_nombre', header: 'Técnico' },
    { key: 'items', header: 'Materiales', render: (r) => `${r.items.length} ítem(s)` },
    { key: 'estado', header: 'Estado', render: (r) => <Badge tone={ESTADO_RETIRO[r.estado].tone}>{ESTADO_RETIRO[r.estado].label}</Badge> },
  ]

  const entregar = async () => {
    setTrabajando(true)
    const r = await runAction(retirosService.entregar(actual.id), 'Solicitud entregada: salidas registradas en el Cardex')
    setTrabajando(false)
    if (r) { setConfirmar(false); reload() }
  }
  const rechazar = async () => {
    setTrabajando(true)
    const r = await runAction(retirosService.rechazar(actual.id, rechazo), 'Solicitud rechazada')
    setTrabajando(false)
    if (r) { setRechazo(null); reload() }
  }

  return (
    <>
      <Card padded={false}>
        <DataTable columns={columns} rows={data ?? []} rowKey={(r) => r.id} loading={loading && !data} onRowClick={(r) => setSel(r.id)}
          emptyTitle="Sin solicitudes" emptyHint="Las solicitudes de materiales enviadas desde terreno aparecerán aquí." />
      </Card>

      <Drawer open={Boolean(actual)} onClose={() => setSel(null)} title={actual ? `Solicitud ${actual.id}` : ''}>
        {actual && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Badge tone={ESTADO_RETIRO[actual.estado].tone}>{ESTADO_RETIRO[actual.estado].label}</Badge>
              <Mono className="text-xs text-ink-soft">{formatFechaHora(actual.fecha)}</Mono>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-ink-soft">Obra</dt><dd className="font-medium">{actual.obra_nombre}</dd></div>
              <div><dt className="text-xs text-ink-soft">Técnico</dt><dd className="font-medium">{actual.tecnico_nombre}</dd></div>
            </dl>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-soft"><th className="py-2 font-medium">Artículo</th><th className="py-2 text-right font-medium">Pedido</th><th className="py-2 text-right font-medium">Stock</th></tr></thead>
              <tbody>
                {actual.items.map((it) => {
                  const falta = actual.estado === 'PENDIENTE' && it.stock < it.cantidad
                  return (
                    <tr key={it.articulo_id} className="border-b border-line last:border-0">
                      <td className="py-2"><p>{it.nombre}</p><Mono className="text-xs text-ink-soft">{it.sku}</Mono></td>
                      <td className="py-2 text-right"><Mono>{it.cantidad} {it.unidad}</Mono></td>
                      <td className="py-2 text-right"><Mono className={falta ? 'font-semibold text-crit' : ''}>{it.stock}</Mono>{falta && <p className="text-[11px] text-crit">Insuficiente</p>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {actual.observaciones && <p className="rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">“{actual.observaciones}”</p>}
            {actual.motivo_rechazo && <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit">Motivo del rechazo: {actual.motivo_rechazo}</p>}
            {actual.movimientos.length > 0 && <p className="text-xs text-ink-soft">Movimientos generados: <Mono>{actual.movimientos.join(', ')}</Mono></p>}
            {actual.estado === 'PENDIENTE' && puede && (
              <div className="flex gap-2 border-t border-line pt-4">
                <Button icon={CheckCircle2} onClick={() => setConfirmar(true)}>Entregar materiales</Button>
                <Button variant="secondary" icon={XCircle} onClick={() => setRechazo('')}>Rechazar</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={confirmar} onClose={() => setConfirmar(false)} onConfirm={entregar} loading={trabajando}
        title="Entregar materiales" confirmLabel="Registrar salidas"
        message="Se generará una salida de Cardex por cada ítem, imputada a la obra. Si falta stock en algún ítem no se registra ninguna." />
      <Modal open={rechazo !== null} onClose={() => setRechazo(null)} title="Rechazar solicitud"
        footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button><Button variant="danger" onClick={rechazar} loading={trabajando} disabled={!rechazo?.trim()}>Rechazar</Button></>}>
        <Textarea label="Motivo" value={rechazo ?? ''} onChange={(e) => setRechazo(e.target.value)} />
      </Modal>
    </>
  )
}

