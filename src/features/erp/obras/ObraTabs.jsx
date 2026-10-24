import { Link } from 'react-router-dom'
import { Card, DataTable, KpiTile, Mono, Badge, Skeleton } from '@/components/ui'
import { MoneyCell, MarginGauge, CardexTypeBadge, HojaStatusBadge, ChecklistResultBadge } from '@/components/domain'
import { Boxes, HardHat, Wallet, Receipt } from 'lucide-react'
import { cardexService, articulosService, hojasService, presupuestosService, obrasService } from '@/services'
import { compararCostos, margenReal } from '@/domain/rentabilidad'
import { manoObraPorTecnico } from '@/domain/obras'
import { conSigno, formatFecha, formatFechaHora, formatPct } from '@/domain/format'
import { useResource } from '@/hooks/useResource'

const ESTADO_DESVIO = {
  SOBRECOSTO: { tone: 'crit', label: 'Sobrecosto' },
  EN_RANGO: { tone: 'ok', label: 'En rango' },
  BAJO_PRESUPUESTO: { tone: 'info', label: 'Bajo presupuesto' },
}

export function CostosTab({ obra }) {
  const real = obra.costo_real
  const pres = useResource(() => (obra.presupuesto_id ? presupuestosService.retrieve(obra.presupuesto_id) : Promise.resolve(null)), [obra.presupuesto_id])
  const hojas = useResource(() => hojasService.list({ obra_id: obra.id }), [obra.id])
  const sim = pres.data?.simulacion
  const cmp = sim ? compararCostos(sim.costoTotal, real.total) : null
  const mr = sim ? margenReal(sim.ventaNeto, real.total) : null
  const porTecnico = manoObraPorTecnico(hojas.data ?? [], obra.id)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiTile label="Materiales (neto Cardex)" value={<MoneyCell value={real.materiales} />} icon={Boxes} hint="Salidas − reingresos − reversas" />
        <KpiTile label="Mano de obra (horas-hombre)" value={<MoneyCell value={real.manoObra} />} icon={HardHat} hint="Horas × tarifa congelada al sincronizar" />
        <KpiTile label="Costo real total" value={<MoneyCell value={real.total} />} icon={Wallet} />
      </div>

      {sim ? (
        <Card title="Presupuestado vs. real">
          <div className="grid gap-6 sm:grid-cols-2">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Costo presupuestado</dt><dd><MoneyCell value={sim.costoTotal} /></dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Costo real a la fecha</dt><dd><MoneyCell value={real.total} /></dd></div>
              <div className="flex items-center justify-between border-t border-line pt-2">
                <dt className="font-medium">Desvío</dt>
                <dd className="flex items-center gap-2"><MoneyCell value={cmp.desvioMonto} className="font-semibold" /><Mono className="text-xs">{formatPct(cmp.desvioPct)}</Mono><Badge tone={ESTADO_DESVIO[cmp.estado].tone}>{ESTADO_DESVIO[cmp.estado].label}</Badge></dd>
              </div>
              <div className="flex justify-between"><dt className="text-ink-soft">Venta neta pactada</dt><dd><MoneyCell value={sim.ventaNeto} /></dd></div>
            </dl>
            <div className="space-y-4">
              <div><p className="mb-1 text-xs text-ink-soft">Margen presupuestado</p><MarginGauge pct={sim.margenPct} /></div>
              <div><p className="mb-1 text-xs text-ink-soft">Margen con costo real</p><MarginGauge pct={mr.margenPct} /></div>
            </div>
          </div>
        </Card>
      ) : (
        <Card><p className="text-sm text-ink-soft">{pres.loading && obra.presupuesto_id ? 'Cargando presupuesto…' : 'Obra sin presupuesto (CU30): aún no hay base de comparación. Regularícela para ver el margen.'}</p></Card>
      )}

      <Card title="Mano de obra por técnico" padded={false}>
        <DataTable rows={porTecnico} rowKey={(r) => r.tecnico_id} loading={hojas.loading && !hojas.data} emptyTitle="Sin horas imputadas"
          columns={[
            { key: 'tecnico', header: 'Técnico', render: (r) => obra.tecnicos_detalle.find((t) => t.id === r.tecnico_id)?.nombre ?? r.tecnico_id },
            { key: 'hojas', header: 'Hojas', align: 'right', mono: true },
            { key: 'horas', header: 'Horas', align: 'right', mono: true },
            { key: 'costo', header: 'Costo', align: 'right', render: (r) => <MoneyCell value={r.costo} /> },
          ]} />
      </Card>
    </div>
  )
}

export function MaterialesTab({ obra }) {
  const { data, loading } = useResource(() => Promise.all([cardexService.list({ obra_id: obra.id }), articulosService.list({ incluirInactivos: true })]), [obra.id])
  if (loading && !data) return <div className="card"><Skeleton rows={5} /></div>
  const [movs, arts] = data
  const nombre = (id) => arts.find((a) => a.id === id)?.nombre ?? id
  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha', mono: true, render: (m) => formatFechaHora(m.fecha) },
    { key: 'tipo', header: 'Tipo', render: (m) => <CardexTypeBadge tipo={m.tipo} /> },
    { key: 'art', header: 'Artículo', render: (m) => nombre(m.articulo_id) },
    { key: 'cant', header: 'Cantidad', align: 'right', render: (m) => <Mono>{conSigno(-m.signo * m.cantidad)}</Mono> },
    { key: 'valor', header: 'Efecto en costo', align: 'right', render: (m) => <MoneyCell value={m.costo_unitario === undefined ? undefined : -m.signo * m.cantidad * m.costo_unitario} /> },
  ]
  return (
    <Card padded={false}>
      <DataTable columns={columns} rows={movs} rowKey={(m) => m.id} emptyTitle="Sin movimientos de materiales" />
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm"><span className="flex items-center gap-2 text-ink-soft"><Receipt className="h-4 w-4" />Costo neto de materiales</span><MoneyCell value={obra.costo_real?.materiales} className="font-semibold" /></div>
    </Card>
  )
}

export function HojasTab({ obra }) {
  const { data, loading } = useResource(() => hojasService.list({ obra_id: obra.id }), [obra.id])
  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha', mono: true, render: (h) => formatFecha(h.fecha) },
    { key: 'tecnico_nombre', header: 'Técnico' },
    { key: 'horas_trabajadas', header: 'Horas', align: 'right', mono: true },
    { key: 'chk', header: 'Checklist', render: (h) => <ChecklistResultBadge resultado={h.evaluacion.resultado} /> },
    { key: 'geo', header: 'Geocerca', render: (h) => (h.geocerca ? <Badge tone={h.geocerca.dentro ? 'ok' : 'crit'}>{h.geocerca.dentro ? 'Dentro' : `Fuera (${h.geocerca.distanciaM} m)`}</Badge> : '—') },
    { key: 'estado', header: 'Estado', render: (h) => <HojaStatusBadge estado={h.estado} /> },
  ]
  return (
    <Card padded={false}>
      <DataTable columns={columns} rows={data ?? []} rowKey={(h) => h.id} loading={loading && !data} emptyTitle="Sin hojas de servicio" emptyHint="Las hojas enviadas desde la app de terreno aparecerán aquí." />
      <div className="border-t border-line px-4 py-3 text-xs text-ink-soft">La auditoría detallada (fotos, checklist, aprobar o devolver) está en <Link to="/erp/terreno" className="font-medium text-brand">Auditoría de Terreno</Link>.</div>
    </Card>
  )
}

export function AuditoriaTab({ obra }) {
  const { data, loading } = useResource(() => obrasService.historial(obra.id), [obra.id])
  const columns = [
    { key: 'fecha', header: 'Fecha', mono: true, render: (l) => formatFechaHora(l.fecha) },
    { key: 'usuario', header: 'Usuario', render: (l) => <div><p>{l.usuario_nombre}</p><p className="text-xs text-ink-soft">{l.rol}</p></div> },
    { key: 'entidad', header: 'Entidad', render: (l) => <span>{l.entidad} <Mono className="text-xs text-ink-soft">{l.entidad_id}</Mono></span> },
    { key: 'accion', header: 'Acción', render: (l) => <Badge tone="neutral">{l.accion}</Badge> },
    { key: 'ip', header: 'IP', mono: true },
  ]
  return <Card padded={false}><DataTable columns={columns} rows={data ?? []} rowKey={(l) => l.id} loading={loading && !data} emptyTitle="Sin registros de auditoría" /></Card>
}
