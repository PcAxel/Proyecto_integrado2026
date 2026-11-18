import { useState } from 'react'
import { Landmark, Wallet, Clock, CheckCircle2, BadgeDollarSign, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, DataTable, Badge, Button, Modal, Input, Select, NumberField, KpiTile, Mono } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { cobranzasService, informesService } from '@/services'
import { formatFecha, isoLocal } from '@/domain/format'
import { formatCLP } from '@/domain/money'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

const METODOS = [{ value: 'TRANSFERENCIA', label: 'Transferencia' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'EFECTIVO', label: 'Efectivo' }, { value: 'TARJETA', label: 'Tarjeta' }, { value: 'OTRO', label: 'Otro' }]
const hoy = () => isoLocal().slice(0, 10)

function PagoModal({ factura, onClose, onSaved }) {
  const [form, setForm] = useState({ fecha: hoy(), monto: factura.saldo, metodo: 'TRANSFERENCIA', referencia: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const excede = form.monto > factura.saldo
  const valido = form.fecha && form.fecha <= hoy() && form.monto > 0 && Number.isInteger(form.monto) && !excede && form.metodo

  const guardar = async () => {
    setGuardando(true)
    const salda = form.monto === factura.saldo
    const r = await runAction(cobranzasService.registrarPago(factura.orden_id, { ...form, referencia: form.referencia.trim() }), salda ? 'Pago registrado: la factura quedó PAGADA' : 'Pago registrado')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open onClose={onClose} title={`Registrar pago · folio ${factura.folio_sii}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button icon={BadgeDollarSign} loading={guardando} disabled={!valido} onClick={guardar}>Registrar pago</Button></>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
          <p className="font-medium">{factura.cliente}</p>
          <p className="mt-0.5 text-xs text-ink-soft"><Mono>{factura.orden_id}</Mono> · total {formatCLP(factura.total)} · pagado {formatCLP(factura.pagado)} · <b>saldo {formatCLP(factura.saldo)}</b></p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Fecha del pago" type="date" max={hoy()} value={form.fecha} onChange={(e) => set('fecha')(e.target.value)} />
          <NumberField label="Monto" prefix="$" min={1} max={factura.saldo} value={form.monto} onChange={(v) => set('monto')(v ?? 0)}
            error={excede ? `El saldo es ${formatCLP(factura.saldo)}` : undefined} hint={!excede ? 'Puede ser un abono' : undefined} />
          <Select label="Método de pago" value={form.metodo} onChange={(e) => set('metodo')(e.target.value)} options={METODOS} />
          <Input label="Referencia (opcional)" placeholder="N° de transferencia o cheque" value={form.referencia} onChange={(e) => set('referencia')(e.target.value)} />
        </div>
        {factura.pagos.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft">Pagos anteriores</p>
            <ul className="space-y-1 text-sm">{factura.pagos.map((p) => <li key={p.id} className="flex justify-between"><span>{formatFecha(p.fecha)} · {p.metodo_label}{p.referencia ? ` · ${p.referencia}` : ''}</span><MoneyCell value={p.monto} /></li>)}</ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Cuentas por cobrar: facturas emitidas, pagos de los clientes y su paso a PAGADA. */
export function CobranzasPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const puede = can(rol, 'cobranzas.gestionar')
  const puedeInforme = ['compras.ver', 'bodega.ver', 'presupuestos.ver', 'obras.ver'].every((p) => can(rol, p))
  const [generando, setGenerando] = useState(false)
  const descargarInforme = async () => {
    setGenerando(true)
    try { await informesService.descargarEjecutivo() } catch (e) { toast.error(e.message) } finally { setGenerando(false) }
  }
  const { data, loading, reload } = useResource(() => cobranzasService.resumen(), [])
  const [pagando, setPagando] = useState(null)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const facturas = (data?.facturas ?? []).filter((f) => !soloPendientes || f.estado_cobro !== 'PAGADA')

  const columns = [
    { key: 'folio', header: 'Folio', mono: true, render: (f) => f.folio_sii },
    { key: 'cliente', header: 'Cliente', render: (f) => <div><p className="font-medium">{f.cliente}</p><Mono className="text-xs text-ink-soft">{f.orden_id}</Mono></div> },
    { key: 'emitida', header: 'Emitida', mono: true, render: (f) => formatFecha(f.emitida_en) },
    { key: 'total', header: 'Total', align: 'right', render: (f) => <MoneyCell value={f.total} /> },
    { key: 'pagado', header: 'Pagado', align: 'right', render: (f) => <MoneyCell value={f.pagado} /> },
    { key: 'saldo', header: 'Saldo', align: 'right', render: (f) => <MoneyCell value={f.saldo} className={f.saldo > 0 ? 'font-semibold' : ''} /> },
    { key: 'estado', header: 'Estado', render: (f) => <Badge tone={f.estado_cobro === 'PAGADA' ? 'ok' : 'warn'} icon={f.estado_cobro === 'PAGADA' ? CheckCircle2 : Clock}>{f.estado_cobro === 'PAGADA' ? 'Pagada' : 'Pendiente de pago'}</Badge> },
    { key: 'acc', header: '', align: 'right', render: (f) => puede && f.estado_cobro !== 'PAGADA' && <Button size="sm" variant="secondary" icon={BadgeDollarSign} onClick={() => setPagando(f)}>Registrar pago</Button> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Cobranzas" subtitle="Pagos de clientes contra las facturas electrónicas emitidas"
        actions={puedeInforme && <Button variant="secondary" icon={Presentation} loading={generando} onClick={descargarInforme}>Informe ejecutivo (PowerPoint)</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiTile label="Por cobrar" value={data ? formatCLP(data.por_cobrar) : '—'} icon={Wallet} tone={data?.por_cobrar ? 'warn' : undefined} hint={data ? `${data.pendientes} factura(s) pendiente(s)` : undefined} />
        <KpiTile label="Cobrado" value={data ? formatCLP(data.cobrado) : '—'} icon={Landmark} tone="ok" />
        <KpiTile label="Facturas emitidas" value={data ? String(data.facturas.length) : '—'} icon={CheckCircle2} />
      </div>
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="text-sm font-semibold">{soloPendientes ? 'Facturas pendientes de pago' : 'Todas las facturas'}</h2>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} className="h-4 w-4 accent-brand" />Solo pendientes
          </label>
        </div>
        <DataTable columns={columns} rows={facturas} rowKey={(f) => f.orden_id} loading={loading && !data}
          emptyTitle={soloPendientes ? 'Sin facturas pendientes de pago' : 'Sin facturas emitidas'} emptyHint="Las facturas aceptadas por el SII aparecen aquí para cobrarlas." />
      </Card>
      {pagando && <PagoModal factura={pagando} onClose={() => setPagando(null)} onSaved={reload} />}
    </div>
  )
}
