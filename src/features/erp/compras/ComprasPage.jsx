import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader, Tabs, Card, DataTable, Button, Badge, Mono, ExportMenu } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { comprasService, proveedoresService, articulosService } from '@/services'
import { formatFecha } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { FacturaDrawer } from './FacturaDrawer'
import { FacturaDetalle } from './FacturaDetalle'
import { NotaCreditoModal } from './NotaCreditoModal'

export function ComprasPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const puede = can(rol, 'compras.registrar')
  const [tab, setTab] = useState('facturas')
  const [nueva, setNueva] = useState(false)
  const [nuevaNC, setNuevaNC] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  const facturas = useResource(() => comprasService.listFacturas(), [])
  const notas = useResource(() => comprasService.listNotasCredito(), [])
  const maestros = useResource(() => Promise.all([proveedoresService.list({ incluirInactivos: true }), articulosService.list({ incluirInactivos: true })]), [])
  const detalle = useResource(() => (detalleId ? comprasService.retrieveFactura(detalleId) : Promise.resolve(null)), [detalleId])
  const [proveedores, articulos] = maestros.data ?? [[], []]
  const prov = (id) => proveedores.find((p) => p.id === id)
  const recargar = () => { facturas.reload(); notas.reload(); detalle.reload() }

  const colsFacturas = [
    { key: 'numero', header: 'N°', mono: true },
    { key: 'proveedor', header: 'Proveedor', render: (f) => prov(f.proveedor_id)?.razon_social ?? f.proveedor_id },
    { key: 'fecha', header: 'Fecha', mono: true, render: (f) => formatFecha(f.fecha) },
    { key: 'desc', header: 'Descuentos', render: (f) => { const ds = f.descuentos.filter((d) => d > 0); return ds.length ? <span className="flex gap-1">{ds.map((d, i) => <Badge key={i} tone="info">{d}%</Badge>)}</span> : <span className="text-ink-faint">—</span> } },
    { key: 'bruto', header: 'Bruto', align: 'right', render: (f) => <MoneyCell value={f.neto_bruto} /> },
    { key: 'neto', header: 'Neto', align: 'right', render: (f) => <MoneyCell value={f.neto} /> },
    { key: 'total', header: 'Total c/IVA', align: 'right', render: (f) => <MoneyCell value={f.total} className="font-medium" /> },
  ]
  const colsNotas = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'numero', header: 'N° NC', mono: true },
    { key: 'factura', header: 'Factura', render: (n) => { const f = (facturas.data ?? []).find((x) => x.id === n.factura_id); return <Mono>{f ? `N° ${f.numero}` : n.factura_id}</Mono> } },
    { key: 'fecha', header: 'Fecha', mono: true, render: (n) => formatFecha(n.fecha) },
    { key: 'motivo', header: 'Motivo' },
    { key: 'total', header: 'Total', align: 'right', render: (n) => <MoneyCell value={n.total} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Compras" subtitle="Facturas con descuentos en cascada y notas de crédito"
        actions={<>
          {tab === 'facturas'
            ? <ExportMenu nombre="facturas-compra" titulo="Facturas de compra" filas={facturas.data ?? []} columnas={[
              { titulo: 'N°', clave: 'numero' }, { titulo: 'Proveedor', clave: (f) => prov(f.proveedor_id)?.razon_social, ancho: 36 }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha' },
              { titulo: 'Descuentos', clave: (f) => f.descuentos.filter((d) => d > 0).map((d) => `${d}%`).join(' + ') }, { titulo: 'Bruto', clave: 'neto_bruto', tipo: 'moneda' },
              { titulo: 'Neto', clave: 'neto', tipo: 'moneda' }, { titulo: 'IVA', clave: 'iva', tipo: 'moneda' }, { titulo: 'Total', clave: 'total', tipo: 'moneda' },
            ]} />
            : <ExportMenu nombre="notas-credito" titulo="Notas de crédito" filas={notas.data ?? []} columnas={[
              { titulo: 'Código', clave: 'id' }, { titulo: 'N° NC', clave: 'numero' }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha' }, { titulo: 'Motivo', clave: 'motivo', ancho: 40 },
              { titulo: 'Neto', clave: 'neto', tipo: 'moneda' }, { titulo: 'IVA', clave: 'iva', tipo: 'moneda' }, { titulo: 'Total', clave: 'total', tipo: 'moneda' },
            ]} />}
          {puede && (tab === 'facturas'
            ? <Button icon={Plus} onClick={() => setNueva(true)}>Registrar factura</Button>
            : <Button icon={Plus} onClick={() => setNuevaNC(true)}>Nueva nota de crédito</Button>)}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'facturas', label: 'Facturas', count: facturas.data?.length }, { id: 'notas', label: 'Notas de crédito', count: notas.data?.length }]} />
      <Card padded={false}>
        {tab === 'facturas'
          ? <DataTable columns={colsFacturas} rows={facturas.data ?? []} rowKey={(f) => f.id} loading={facturas.loading && !facturas.data} onRowClick={(f) => setDetalleId(f.id)} emptyTitle="Sin facturas" />
          : <DataTable columns={colsNotas} rows={notas.data ?? []} rowKey={(n) => n.id} loading={notas.loading && !notas.data} emptyTitle="Sin notas de crédito" />}
      </Card>

      {nueva && <FacturaDrawer open onClose={() => setNueva(false)} onSaved={recargar} />}
      {nuevaNC && <NotaCreditoModal open onClose={() => setNuevaNC(false)} facturas={facturas.data ?? []} proveedores={proveedores} onSaved={recargar} />}
      <FacturaDetalle factura={detalleId ? detalle.data : null} proveedor={prov(detalle.data?.proveedor_id)} articulos={articulos} onClose={() => setDetalleId(null)} />
    </div>
  )
}
