import { useNavigate } from 'react-router-dom'
import { Plus, HardHat, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { PageHeader, Button, Card, DataTable, KpiTile, Select, Mono, ExportMenu } from '@/components/ui'
import { MoneyCell, ObraStatusBadge, EmergencyBadge, TIPO_OBRA_LABEL } from '@/components/domain'
import { obrasService, clientesService } from '@/services'
import { TIPOS_OBRA } from '@/domain/obras'
import { formatFecha } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'

export function ObrasPage() {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.user.rol)
  const [filtros, setFiltro] = usePersistedFilters('obras', { estado: '', tipo: '' })
  const lista = useResource(() => obrasService.list(), [])
  const clientes = useResource(() => clientesService.list({ incluirInactivos: true }), [])
  const nombreCliente = (id) => clientes.data?.find((c) => c.id === id)?.razon_social ?? id

  const todas = lista.data ?? []
  const filas = todas.filter((o) => (!filtros.estado || o.estado === filtros.estado) && (!filtros.tipo || o.tipo === filtros.tipo))
  const cu30 = todas.filter((o) => o.es_emergencia_sin_presupuesto && o.estado !== 'FINALIZADA')
  const kpi = (v) => (lista.data ? v : '—')
  const verCostos = can(rol, 'costos.ver')

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'nombre', header: 'Obra', render: (o) => (
      <div><p className="font-medium">{o.nombre}</p><p className="text-xs text-ink-soft">{nombreCliente(o.cliente_id)} · {o.ubicacion.comuna}</p></div>
    ) },
    { key: 'tipo', header: 'Tipo', render: (o) => TIPO_OBRA_LABEL[o.tipo] },
    { key: 'estado', header: 'Estado', render: (o) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <ObraStatusBadge estado={o.estado} />
        {o.es_emergencia_sin_presupuesto && <EmergencyBadge />}
      </div>
    ) },
    { key: 'cierre', header: 'Cierre', mono: true, render: (o) => `${o.cierre.checks.filter((c) => c.ok).length}/6` },
    { key: 'fechas', header: 'Plazo', mono: true, render: (o) => `${formatFecha(o.fecha_inicio)} → ${formatFecha(o.fecha_cierre ?? o.fecha_fin_estimada)}` },
    ...(verCostos ? [{ key: 'costo', header: 'Costo real', align: 'right', render: (o) => <MoneyCell value={o.costo_real?.total} /> }] : []),
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Obras" subtitle="Proyectos, mantenciones y emergencias en terreno"
        actions={<>
          <ExportMenu nombre="obras" titulo="Obras" filas={filas} columnas={[
            { titulo: 'Código', clave: 'id' }, { titulo: 'Obra', clave: 'nombre', ancho: 46 }, { titulo: 'Cliente', clave: (o) => nombreCliente(o.cliente_id), ancho: 30 }, { titulo: 'Tipo', clave: (o) => TIPO_OBRA_LABEL[o.tipo] },
            { titulo: 'Estado', clave: 'estado' }, { titulo: 'CU30 sin presupuesto', clave: (o) => (o.es_emergencia_sin_presupuesto ? 'Sí' : '') }, { titulo: 'Presupuesto', clave: 'presupuesto_id' }, { titulo: 'Comuna', clave: (o) => o.ubicacion.comuna },
            { titulo: 'Inicio', clave: 'fecha_inicio', tipo: 'fecha' }, { titulo: 'Cierre / estimado', clave: (o) => o.fecha_cierre ?? o.fecha_fin_estimada, tipo: 'fecha' }, { titulo: 'Checks de cierre', clave: (o) => `${o.cierre.checks.filter((c) => c.ok).length}/6` },
            ...(verCostos ? [{ titulo: 'Costo real', clave: (o) => o.costo_real?.total, tipo: 'moneda' }] : []),
          ]} />
          {can(rol, 'obras.crear') && <Button icon={Plus} onClick={() => navigate('/erp/obras/nueva')}>Nueva obra</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="En curso" value={kpi(todas.filter((o) => o.estado === 'EN_CURSO').length)} icon={HardHat} />
        <KpiTile label="CU30 por regularizar" value={kpi(cu30.length)} icon={AlertTriangle} tone={cu30.length ? 'warn' : 'neutral'} hint="Emergencias sin presupuesto" />
        <KpiTile label="Planificadas" value={kpi(todas.filter((o) => o.estado === 'PLANIFICADA').length)} icon={CalendarClock} />
        <KpiTile label="Finalizadas" value={kpi(todas.filter((o) => o.estado === 'FINALIZADA').length)} icon={CheckCircle2} tone="ok" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Select label="Estado" value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)} placeholder="Todos" className="w-full sm:w-44"
            options={[{ value: 'PLANIFICADA', label: 'Planificada' }, { value: 'EN_CURSO', label: 'En curso' }, { value: 'FINALIZADA', label: 'Finalizada' }]} />
          <Select label="Tipo" value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)} placeholder="Todos" className="w-full sm:w-44"
            options={TIPOS_OBRA.map((t) => ({ value: t, label: TIPO_OBRA_LABEL[t] }))} />
          <Mono className="ml-auto pb-2 text-xs text-ink-soft">{filas.length} resultados</Mono>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(o) => o.id} loading={lista.loading && !lista.data}
          onRowClick={(o) => navigate(`/erp/obras/${o.id}`)} emptyTitle="Sin obras" emptyHint="Ajusta los filtros o crea una nueva obra." />
      </Card>
    </div>
  )
}
