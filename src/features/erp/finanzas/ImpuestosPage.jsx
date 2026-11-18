import { useState } from 'react'
import { Landmark, TrendingDown, TrendingUp, PiggyBank } from 'lucide-react'
import { PageHeader, Card, DataTable, KpiTile, ExportMenu, Mono, Skeleton } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { ErrorEstado } from '@/components/ErrorEstado'
import { finanzasService } from '@/services'
import { formatCLP } from '@/domain/money'
import { formatFecha, fechaLocal } from '@/domain/format'
import { formulaIva, nombreMes, presentarLibroIva } from '@/domain/resumenTributario'
import { useResource } from '@/hooks/useResource'

const dinero = (titulo, clave, ancho) => ({ titulo, clave, tipo: 'moneda', ancho })
const money = (key, header) => ({ key, header, align: 'right', render: (r) => <MoneyCell value={r[key]} /> })

/** Libro de IVA del mes: lo que Finanzas necesita para preparar el pago de impuestos (débito, crédito, remanente y los documentos que lo respaldan). */
export function ImpuestosPage() {
  const [mes, setMes] = useState(() => fechaLocal().slice(0, 7))
  const { data, error, loading, reload } = useResource(() => finanzasService.impuestos(mes), [mes])
  const r = data && presentarLibroIva(data.iva)

  const colVentas = [
    { key: 'folio', header: 'Folio', mono: true }, { key: 'fecha', header: 'Fecha', mono: true, render: (d) => formatFecha(d.fecha) },
    { key: 'cliente', header: 'Cliente', render: (d) => <div><p className="font-medium">{d.cliente}</p><Mono className="text-xs text-ink-soft">{d.rut} · {d.obra}</Mono></div> },
    money('neto', 'Neto'), money('iva', 'IVA'), money('total', 'Total'),
  ]
  const colCompras = [
    { key: 'numero', header: 'N° factura', mono: true }, { key: 'fecha', header: 'Fecha', mono: true, render: (d) => formatFecha(d.fecha) },
    { key: 'proveedor', header: 'Proveedor', render: (d) => <div><p className="font-medium">{d.proveedor}</p><Mono className="text-xs text-ink-soft">{d.rut}</Mono></div> },
    money('neto', 'Neto'), money('iva', 'IVA crédito'), money('total', 'Total'),
  ]
  const colNotas = [
    { key: 'numero', header: 'N° nota', mono: true }, { key: 'fecha', header: 'Fecha', mono: true, render: (d) => formatFecha(d.fecha) },
    { key: 'factura', header: 'Factura de origen', mono: true }, { key: 'motivo', header: 'Motivo' }, money('neto', 'Neto'), money('iva', 'IVA'),
  ]
  const colHistorial = [
    { key: 'mes', header: 'Mes', render: (h) => <span className="capitalize">{nombreMes(h.mes)}</span> },
    money('debito', 'IVA ventas'), money('credito', 'IVA compras'), money('remanente_anterior', 'Remanente anterior'),
    { key: 'a_pagar', header: 'A pagar', align: 'right', render: (h) => <MoneyCell value={h.a_pagar} className={h.a_pagar > 0 ? 'font-semibold text-crit' : ''} /> },
    { key: 'remanente_final', header: 'Remanente final', align: 'right', render: (h) => <MoneyCell value={h.remanente_final} className={h.remanente_final > 0 ? 'font-semibold text-ok' : ''} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Impuestos (IVA)" subtitle="Débito, crédito y remanente del mes, con los documentos que lo respaldan para preparar el F29"
        actions={
          <label className="text-xs font-medium text-ink-soft">
            <span className="mr-2">Mes</span>
            <input type="month" value={mes} max={fechaLocal().slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink" />
          </label>
        } />

      {error ? <ErrorEstado error={error} onRetry={reload} /> : !data ? <Skeleton rows={6} /> : (<>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiTile label="IVA débito (ventas)" value={formatCLP(data.iva.debito)} icon={TrendingUp} hint={`${data.ventas.documentos.length} facturas electrónicas · neto ${formatCLP(data.ventas.neto)}`} />
          <KpiTile label="IVA crédito (compras)" value={formatCLP(data.iva.credito)} icon={TrendingDown} hint={`${data.compras.documentos.length} facturas − ${data.compras.notas_credito.length} nota(s) de crédito`} />
          <KpiTile label="Remanente del mes anterior" value={formatCLP(data.iva.remanente_anterior)} icon={PiggyBank} tone={data.iva.remanente_anterior > 0 ? 'ok' : 'neutral'} hint="Crédito fiscal que se arrastra" />
          <KpiTile label={r.titulo} value={formatCLP(r.valor)} icon={Landmark} tone={r.tono} hint={r.nota} />
        </div>

        <Card title={`Cálculo de ${nombreMes(data.periodo)}`} subtitle="IVA ventas − IVA compras − remanente anterior">
          <p className="font-mono text-sm text-ink" data-testid="formula-iva">{formulaIva(data.iva)}</p>
          <p className="mt-2 text-xs text-ink-soft">
            Es una proyección con los documentos registrados en el sistema; revisa que estén todos antes de declarar. El remanente se muestra en pesos nominales
            (sin reajuste por IPC) y no incluye el PPM ni otros códigos del F29.
          </p>
        </Card>

        <Card padded={false} title="Facturas de venta (IVA débito)" action={<ExportMenu nombre={`iva-ventas-${data.periodo}`} titulo={`Facturas de venta ${data.periodo}`} filas={data.ventas.documentos}
          columnas={[{ titulo: 'Folio', clave: 'folio' }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha' }, { titulo: 'Cliente', clave: 'cliente', ancho: 34 }, { titulo: 'RUT', clave: 'rut' },
            dinero('Neto', 'neto'), dinero('IVA', 'iva'), dinero('Total', 'total')]} />}>
          <DataTable columns={colVentas} rows={data.ventas.documentos} rowKey={(d) => d.folio} emptyTitle="Sin ventas en el mes" emptyHint="Las facturas electrónicas aceptadas por el SII aparecen aquí." />
        </Card>

        <Card padded={false} title="Facturas de compra (IVA crédito)" action={<ExportMenu nombre={`iva-compras-${data.periodo}`} titulo={`Facturas de compra ${data.periodo}`} filas={data.compras.documentos}
          columnas={[{ titulo: 'N° factura', clave: 'numero' }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha' }, { titulo: 'Proveedor', clave: 'proveedor', ancho: 34 }, { titulo: 'RUT', clave: 'rut' },
            dinero('Neto', 'neto'), dinero('IVA crédito', 'iva'), dinero('Total', 'total')]} />}>
          <DataTable columns={colCompras} rows={data.compras.documentos} rowKey={(d) => d.id} emptyTitle="Sin compras en el mes" emptyHint="Las facturas registradas en Compras aparecen aquí." />
        </Card>

        {data.compras.notas_credito.length > 0 && (
          <Card padded={false} title="Notas de crédito (restan crédito fiscal)">
            <DataTable columns={colNotas} rows={data.compras.notas_credito} rowKey={(d) => d.id} />
          </Card>
        )}

        <Card padded={false} title="Historial mes a mes" subtitle="Cómo se arrastra el remanente de un mes a otro">
          <DataTable columns={colHistorial} rows={[...data.historial].reverse()} rowKey={(h) => h.mes} emptyTitle="Sin historial" />
        </Card>
      </>)}
      {loading && data && <span className="sr-only" role="status">Actualizando…</span>}
    </div>
  )
}
