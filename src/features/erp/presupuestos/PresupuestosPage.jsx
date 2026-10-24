import { useNavigate } from 'react-router-dom'
import { Plus, FileText, CheckCircle2, TrendingUp, AlertTriangle } from 'lucide-react'
import { PageHeader, Button, Card, DataTable, KpiTile, Select, Mono, ExportMenu } from '@/components/ui'
import { MoneyCell, MarginGauge, PresupuestoStatusBadge, TIPO_OBRA_LABEL } from '@/components/domain'
import { presupuestosService, clientesService } from '@/services'
import { formatCLP } from '@/domain/money'
import { formatFecha, formatPct } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'

export function PresupuestosPage() {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.user.rol)
  const [filtros, setFiltro] = usePersistedFilters('presupuestos', { estado: '' })
  const lista = useResource(() => presupuestosService.list(), [])
  const clientes = useResource(() => clientesService.list({ incluirInactivos: true }), [])
  const nombreCliente = (id) => clientes.data?.find((c) => c.id === id)?.razon_social ?? id

  const todos = lista.data ?? []
  const filas = todos.filter((p) => !filtros.estado || p.estado === filtros.estado)
  const aprobados = todos.filter((p) => p.estado === 'APROBADO')
  const enRojo = todos.filter((p) => ['BORRADOR', 'ENVIADO'].includes(p.estado) && p.simulacion.bajoMinimo)
  const margenProm = aprobados.length ? aprobados.reduce((s, p) => s + p.simulacion.margenPct, 0) / aprobados.length : 0
  const kpi = (v) => (lista.data ? v : '—')

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'titulo', header: 'Presupuesto', render: (p) => <div><p className="font-medium">{p.titulo}</p><p className="text-xs text-ink-soft">{nombreCliente(p.cliente_id)} · {TIPO_OBRA_LABEL[p.tipo_obra]}</p></div> },
    { key: 'estado', header: 'Estado', render: (p) => <PresupuestoStatusBadge estado={p.estado} /> },
    { key: 'venta', header: 'Venta neta', align: 'right', render: (p) => <MoneyCell value={p.simulacion.ventaNeto} /> },
    { key: 'margen', header: 'Margen', render: (p) => <MarginGauge pct={p.simulacion.margenPct} compact /> },
    { key: 'fecha', header: 'Fecha', mono: true, render: (p) => formatFecha(p.fecha) },
    { key: 'obra', header: 'Obra', mono: true, render: (p) => p.obra_id ?? <span className="text-ink-faint">—</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Presupuestos" subtitle="Cotizaciones con simulación de rentabilidad previa"
        actions={<>
          <ExportMenu nombre="presupuestos" titulo="Presupuestos" subtitulo="Con margen simulado" filas={filas} columnas={[
            { titulo: 'Código', clave: 'id' }, { titulo: 'Título', clave: 'titulo', ancho: 44 }, { titulo: 'Cliente', clave: (p) => nombreCliente(p.cliente_id), ancho: 30 }, { titulo: 'Tipo', clave: (p) => TIPO_OBRA_LABEL[p.tipo_obra] },
            { titulo: 'Estado', clave: 'estado' }, { titulo: 'Costo total', clave: (p) => p.simulacion.costoTotal, tipo: 'moneda' }, { titulo: 'Venta neta', clave: (p) => p.simulacion.ventaNeto, tipo: 'moneda' },
            { titulo: 'Total c/IVA', clave: (p) => p.simulacion.ventaTotal, tipo: 'moneda' }, { titulo: 'Margen', clave: (p) => p.simulacion.margenPct, tipo: 'porcentaje' }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fecha' }, { titulo: 'Obra', clave: 'obra_id' },
          ]} />
          {can(rol, 'presupuestos.crear') && <Button icon={Plus} onClick={() => navigate('/erp/presupuestos/nuevo')}>Nuevo presupuesto</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="En preparación" value={kpi(todos.filter((p) => ['BORRADOR', 'ENVIADO'].includes(p.estado)).length)} icon={FileText} hint="Borradores y enviados" />
        <KpiTile label="Aprobados" value={kpi(formatCLP(aprobados.reduce((s, p) => s + p.simulacion.ventaNeto, 0)))} icon={CheckCircle2} hint={`${aprobados.length} presupuesto(s) · venta neta`} />
        <KpiTile label="Margen promedio aprobados" value={kpi(formatPct(margenProm))} icon={TrendingUp} tone={margenProm < 20 ? 'crit' : margenProm < 30 ? 'warn' : 'ok'} />
        <KpiTile label="Bajo margen mínimo" value={kpi(enRojo.length)} icon={AlertTriangle} tone={enRojo.length ? 'crit' : 'neutral'} hint="Requieren aprobación de Gerencia" />
      </div>

      <Card padded={false}>
        <div className="flex items-end gap-3 border-b border-line p-4">
          <Select label="Estado" value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)} placeholder="Todos" className="w-full sm:w-48"
            options={['BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO'].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }))} />
          <Mono className="ml-auto pb-2 text-xs text-ink-soft">{filas.length} resultados</Mono>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(p) => p.id} loading={lista.loading && !lista.data}
          onRowClick={(p) => navigate(`/erp/presupuestos/${p.id}`)} emptyTitle="Sin presupuestos" emptyHint="Crea el primero con «Nuevo presupuesto»." />
      </Card>
    </div>
  )
}
