import { useNavigate } from 'react-router-dom'
import { Plus, AlertTriangle } from 'lucide-react'
import { PageHeader, Button, Card, DataTable, Mono, ExportMenu } from '@/components/ui'
import { MoneyCell, MarginGauge, FranjaEstados, PresupuestoStatusBadge, TIPO_OBRA_LABEL } from '@/components/domain'
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

      <FranjaEstados
        cargando={!lista.data}
        activo={filtros.estado}
        onElegir={(id) => setFiltro('estado', id)}
        segmentos={[
          { id: '', label: 'Todos', valor: todos.length },
          { id: 'BORRADOR', label: 'Borrador', valor: todos.filter((p) => p.estado === 'BORRADOR').length, tono: 'neutral' },
          { id: 'ENVIADO', label: 'Enviado', valor: todos.filter((p) => p.estado === 'ENVIADO').length, tono: 'info' },
          { id: 'APROBADO', label: 'Aprobado', valor: aprobados.length, tono: 'ok' },
          { id: 'RECHAZADO', label: 'Rechazado', valor: todos.filter((p) => p.estado === 'RECHAZADO').length, tono: 'crit' },
        ]}
        nota={lista.data ? (
          <div className="text-sm">
            <p className="text-ink">Aprobado: <b className="tabular-nums">{formatCLP(aprobados.reduce((s, p) => s + p.simulacion.ventaNeto, 0))}</b> neto, margen medio <b>{formatPct(margenProm)}</b></p>
            {enRojo.length > 0 && <p className="mt-1 flex items-center gap-1.5 font-medium text-crit"><AlertTriangle className="h-3.5 w-3.5" />{enRojo.length} bajo el mínimo de 20 %: decide la Gerencia</p>}
          </div>
        ) : undefined}
      />

      <Card padded={false}>
        <div className="flex items-end gap-3 border-b border-line p-4">
          <Mono className="ml-auto pb-2 text-xs text-ink-soft">{filas.length} resultados</Mono>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(p) => p.id} loading={lista.loading && !lista.data}
          onRowClick={(p) => navigate(`/erp/presupuestos/${p.id}`)} emptyTitle="Sin presupuestos" emptyHint="Crea el primero con «Nuevo presupuesto»." />
      </Card>
    </div>
  )
}
