import { useState } from 'react'
import { CheckCircle2, XCircle, ClipboardList, Clock, FileText } from 'lucide-react'
import { PageHeader, Card, DataTable, Drawer, Button, ConfirmDialog, Modal, Textarea, KpiTile, Mono } from '@/components/ui'
import { EstadoSolicitudBadge, MoneyCell } from '@/components/domain'
import { solicitudesCompraService, ordenesCompraService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

/** Finanzas: transforma las solicitudes de Bodega en órdenes de compra formales (una por proveedor, al último costo) o las rechaza con motivo. */
export function AprobacionComprasPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const puede = can(rol, 'compras.aprobar')
  const { data, loading, reload } = useResource(() => Promise.all([solicitudesCompraService.list(), ordenesCompraService.list()]), [])
  const [solicitudes, ordenes] = data ?? [[], []]
  const [sel, setSel] = useState(null)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [confirmar, setConfirmar] = useState(false)
  const [rechazo, setRechazo] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const actual = sel && solicitudes.find((s) => s.id === sel)
  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE')
  const filas = soloPendientes ? pendientes : solicitudes
  const proveedores = actual ? new Set(actual.items.map((i) => i.proveedor)) : new Set()

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha', mono: true, render: (s) => formatFechaHora(s.fecha) },
    { key: 'solicitante', header: 'Solicitó', render: (s) => s.solicitante_nombre },
    { key: 'motivo', header: 'Motivo', render: (s) => <span className="line-clamp-1 max-w-xs">{s.motivo}</span> },
    { key: 'items', header: 'Artículos', render: (s) => `${s.items.length} ítem(s)` },
    { key: 'total', header: 'Estimado', align: 'right', render: (s) => <MoneyCell value={s.total_estimado} /> },
    { key: 'estado', header: 'Estado', render: (s) => <EstadoSolicitudBadge estado={s.estado} /> },
  ]

  const emitir = async () => {
    setTrabajando(true)
    const r = await runAction(solicitudesCompraService.emitirOrdenes(actual.id), 'Solicitud aprobada: órdenes de compra emitidas')
    setTrabajando(false)
    if (r) { setConfirmar(false); setSel(null); reload() }
  }
  const rechazar = async () => {
    setTrabajando(true)
    const r = await runAction(solicitudesCompraService.rechazar(actual.id, rechazo), 'Solicitud rechazada')
    setTrabajando(false)
    if (r) { setRechazo(null); setSel(null); reload() }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Aprobación de Compras" subtitle="Solicitudes de Bodega que se convierten en órdenes de compra a proveedores" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiTile label="Solicitudes pendientes" value={String(pendientes.length)} icon={Clock} tone={pendientes.length ? 'warn' : undefined} />
        <KpiTile label="Órdenes emitidas" value={String(ordenes.length)} icon={FileText} />
        <KpiTile label="Solicitudes totales" value={String(solicitudes.length)} icon={ClipboardList} />
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="text-sm font-semibold">{soloPendientes ? 'Solicitudes por aprobar' : 'Todas las solicitudes'}</h2>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} className="h-4 w-4 accent-brand" />Solo pendientes
          </label>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(s) => s.id} loading={loading && !data} onRowClick={(s) => setSel(s.id)}
          emptyTitle={soloPendientes ? 'Sin solicitudes pendientes' : 'Sin solicitudes'} emptyHint="Las solicitudes que cree el Jefe de Bodega aparecerán aquí." />
      </Card>

      <Card title="Órdenes de compra emitidas" padded={false}>
        <DataTable rowKey={(o) => o.id} rows={ordenes} loading={loading && !data} emptyTitle="Sin órdenes emitidas" emptyHint="Al aprobar una solicitud se emite una orden por proveedor."
          columns={[
            { key: 'id', header: 'Orden', mono: true }, { key: 'fecha', header: 'Fecha', mono: true, render: (o) => formatFechaHora(o.fecha) },
            { key: 'proveedor', header: 'Proveedor', render: (o) => o.proveedor_nombre }, { key: 'solicitud', header: 'Solicitud', mono: true, render: (o) => o.solicitud_id },
            { key: 'items', header: 'Artículos', render: (o) => `${o.items.length} ítem(s)` },
            { key: 'neto', header: 'Neto', align: 'right', render: (o) => <MoneyCell value={o.neto} /> }, { key: 'total', header: 'Total con IVA', align: 'right', render: (o) => <MoneyCell value={o.total} className="font-semibold" /> },
          ]} />
      </Card>

      <Drawer open={Boolean(actual)} onClose={() => setSel(null)} title={actual ? `Solicitud ${actual.id}` : ''}>
        {actual && (
          <div className="space-y-5">
            <div className="flex items-center justify-between"><EstadoSolicitudBadge estado={actual.estado} /><Mono className="text-xs text-ink-soft">{formatFechaHora(actual.fecha)}</Mono></div>
            <p className="text-sm text-ink-soft">Solicitada por <b>{actual.solicitante_nombre}</b>: “{actual.motivo}”</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="py-2 font-medium">Artículo</th><th className="py-2 text-right font-medium">Cant.</th><th className="py-2 text-right font-medium">Último costo</th><th className="py-2 text-right font-medium">Subtotal</th>
              </tr></thead>
              <tbody>{actual.items.map((it) => (
                <tr key={it.articulo_id} className="border-b border-line last:border-0">
                  <td className="py-2"><p>{it.nombre}</p><p className="text-xs text-ink-soft"><Mono>{it.sku}</Mono> · {it.proveedor}</p></td>
                  <td className="py-2 text-right"><Mono>{it.cantidad} {it.unidad}</Mono></td>
                  <td className="py-2 text-right"><MoneyCell value={it.costo_unitario} /></td>
                  <td className="py-2 text-right"><MoneyCell value={it.subtotal} /></td>
                </tr>
              ))}</tbody>
            </table>
            <p className="flex items-center justify-between text-sm font-semibold">Total estimado (neto)<MoneyCell value={actual.total_estimado} /></p>
            {actual.estado === 'RECHAZADA' && <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit">Motivo del rechazo: {actual.motivo_rechazo}</p>}
            {actual.estado === 'APROBADA' && <p className="rounded-lg bg-ok-bg p-3 text-sm text-ok">Órdenes emitidas: <Mono className="font-semibold">{actual.orden_ids.join(', ')}</Mono></p>}
            {actual.estado === 'PENDIENTE' && puede && (
              <div className="flex gap-2 border-t border-line pt-4">
                <Button icon={CheckCircle2} onClick={() => setConfirmar(true)}>Aprobar y emitir órdenes</Button>
                <Button variant="secondary" icon={XCircle} onClick={() => setRechazo('')}>Rechazar</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={confirmar} onClose={() => setConfirmar(false)} onConfirm={emitir} loading={trabajando} title="Aprobar y emitir órdenes" confirmLabel="Emitir órdenes"
        message={`Se emitirá una orden de compra por proveedor (${proveedores.size}) con el último costo de cada artículo. Las órdenes emitidas no se editan.`} />
      <Modal open={rechazo !== null} onClose={() => setRechazo(null)} title="Rechazar solicitud"
        footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button><Button variant="danger" loading={trabajando} disabled={!rechazo?.trim()} onClick={rechazar}>Rechazar</Button></>}>
        <Textarea label="Motivo (le llegará a Bodega)" value={rechazo ?? ''} onChange={(e) => setRechazo(e.target.value)} />
      </Modal>
    </div>
  )
}
