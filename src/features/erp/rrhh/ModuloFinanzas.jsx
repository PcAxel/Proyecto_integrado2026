import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, Card, DataTable, Modal, Input, Badge, Mono, Tabs } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { formatFecha, formatFechaHora } from '@/domain/format'
import { COMPROBANTES_ACEPTADOS, ESTADO_PAGO, pesos, validarArchivo } from '@/domain/rrhh'
import { rrhhService } from '@/services'

function PagoModal({ finiquito: f, onClose, onSaved }) {
  const [archivo, setArchivo] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const pagar = async (ev) => {
    ev.preventDefault()
    const e = validarArchivo(archivo, ['pdf', 'png', 'jpg', 'jpeg'])
    if (e) return setError(e)
    setGuardando(true)
    setError('')
    try {
      await rrhhService.pagarFiniquito(f.id, archivo)
      toast.success(`Finiquito de ${f.empleado_nombre} marcado como pagado.`)
      onSaved()
      onClose()
    } catch (err) {
      const d = err.data?.comprobante_pago ?? err.data?.non_field_errors
      setError(d ? [].concat(d)[0] : err.message)
    } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Pagar finiquito · ${f.empleado_nombre}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-pago" loading={guardando}>Marcar como pagado</Button></>}>
      <form id="form-pago" onSubmit={pagar} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-ink-soft">{f.causal_texto} · término {formatFecha(f.fecha_termino)}</p>
          <p className="t-display mt-1 text-3xl"><Mono>{pesos(f.monto_total)}</Mono></p>
          <p className="mt-1 text-xs text-ink-soft">Indemnización {pesos(f.monto_indemnizacion)} · el resto corresponde a vacaciones proporcionales.</p>
        </div>
        <Input label="Comprobante de transferencia (PDF, PNG o JPG · máx. 10 MB)" type="file" required accept={COMPROBANTES_ACEPTADOS} onChange={(ev) => { setArchivo(ev.target.files?.[0] ?? null); setError('') }} error={error} />
        <p className="text-xs text-ink-soft">Al marcarlo como pagado el finiquito no se puede modificar y el contrato queda finiquitado.</p>
      </form>
    </Modal>
  )
}

/** Finanzas: finiquitos por pagar. Solo registra el pago y su comprobante; el cálculo es de RR. HH. */
export function ModuloFinanzas() {
  const rol = useAuthStore((s) => s.user?.rol)
  const paga = can(rol, 'finiquitos.pagar')
  const [tab, setTab] = useState('PENDIENTE')
  const [pago, setPago] = useState(null)
  const pendientes = useResource(() => rrhhService.finiquitos('PENDIENTE'), [])
  const pagados = useResource(() => rrhhService.finiquitos('PAGADO'), [])
  const lista = tab === 'PENDIENTE' ? pendientes : pagados
  const recargar = () => { pendientes.reload(); pagados.reload() }

  const columns = [
    { key: 'emp', header: 'Empleado', render: (f) => <div><p className="font-medium">{f.empleado_nombre}</p><p className="text-xs text-ink-soft">{f.causal_texto}</p></div> },
    { key: 'term', header: 'Término', render: (f) => <Mono>{formatFecha(f.fecha_termino)}</Mono> },
    { key: 'total', header: 'Monto a pagar', align: 'right', render: (f) => <Mono>{pesos(f.monto_total)}</Mono> },
    { key: 'estado', header: 'Estado', render: (f) => <div><Badge tone={ESTADO_PAGO[f.estado_pago].tone}>{ESTADO_PAGO[f.estado_pago].label}</Badge>{f.pagado_en && <p className="mt-1 text-xs text-ink-soft">{formatFechaHora(f.pagado_en)}</p>}</div> },
    { key: 'acc', header: '', align: 'right', render: (f) => f.estado_pago === 'PENDIENTE'
      ? (paga && <Button size="sm" onClick={() => setPago(f)}>Registrar pago</Button>)
      : (f.tiene_comprobante && <Button size="sm" variant="ghost" icon={Download} onClick={(ev) => { ev.stopPropagation(); rrhhService.descargarComprobante(f.id).catch((e) => toast.error(e.message)) }}>Comprobante</Button>) },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="Finiquitos por Pagar" description={paga ? 'Adjunta el comprobante de transferencia para marcar un finiquito como pagado.' : 'Supervisión de finiquitos (solo lectura).'} />
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'PENDIENTE', label: 'Por pagar', count: pendientes.data?.length }, { id: 'PAGADO', label: 'Pagados', count: pagados.data?.length }]} />
        <div className="pt-2">
          {lista.error ? <ErrorEstado error={lista.error} onRetry={lista.reload} /> : (
            <DataTable columns={columns} rows={lista.data ?? []} loading={lista.loading && !lista.data} rowKey={(f) => f.id}
              onRowClick={paga && tab === 'PENDIENTE' ? setPago : undefined}
              emptyTitle={tab === 'PENDIENTE' ? 'No hay finiquitos por pagar' : 'Aún no hay finiquitos pagados'} />
          )}
        </div>
      </Card>
      {pago && <PagoModal finiquito={pago} onClose={() => setPago(null)} onSaved={recargar} />}
    </div>
  )
}
