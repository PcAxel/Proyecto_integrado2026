import { useMemo, useState } from 'react'
import { Boxes, AlertTriangle, PackageX, Wallet, Plus, Pencil, Power, History } from 'lucide-react'
import { Button, IconButton, Input, Select, DataTable, KpiTile, Badge, ConfirmDialog, Card, Mono, ExportMenu } from '@/components/ui'
import { MoneyCell, StockBadge } from '@/components/domain'
import { articulosService } from '@/services'
import { valorInventario } from '@/domain/cardex'
import { formatCLP } from '@/domain/money'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'
import { ArticuloModal } from './ArticuloModal'

const COLS_EXPORT = [
  { titulo: 'SKU', clave: 'sku' }, { titulo: 'Artículo', clave: 'nombre', ancho: 40 }, { titulo: 'Categoría', clave: 'categoria', ancho: 24 }, { titulo: 'Unidad', clave: 'unidad' },
  { titulo: 'Stock', clave: 'stock', tipo: 'numero' }, { titulo: 'Stock mínimo', clave: 'stock_minimo', tipo: 'numero' }, { titulo: 'Último costo', clave: 'costo_unitario', tipo: 'moneda' },
  { titulo: 'Valor stock', clave: (a) => (a.costo_unitario === undefined ? null : a.stock * a.costo_unitario), tipo: 'moneda' }, { titulo: 'Alerta', clave: (a) => ({ OK: 'Normal', BAJO: 'Bajo mínimo', SIN_STOCK: 'Sin stock' })[a.estado_stock] },
]

export function ArticulosTab({ onVerKardex }) {
  const rol = useAuthStore((s) => s.user.rol)
  const gestiona = can(rol, 'articulos.gestionar')
  const [filtros, setFiltro] = usePersistedFilters('bodega-articulos', { q: '', categoria: '', estado: '', inactivos: false })
  const { data, loading, reload } = useResource(() => articulosService.list({ incluirInactivos: true }), [])
  const [modal, setModal] = useState(null) // { articulo? }
  const [toggle, setToggle] = useState(null)

  const todos = data ?? []
  const categorias = useMemo(() => [...new Set(todos.map((a) => a.categoria))].sort(), [todos])
  const filas = todos.filter((a) => {
    const q = filtros.q.trim().toLowerCase()
    return (filtros.inactivos || a.activo)
      && (!filtros.categoria || a.categoria === filtros.categoria)
      && (!filtros.estado || a.estado_stock === filtros.estado)
      && (!q || a.nombre.toLowerCase().includes(q) || a.sku.toLowerCase().includes(q))
  })
  const activos = todos.filter((a) => a.activo)
  const valor = valorInventario(activos)
  const kpi = (n) => (data ? n : '—')

  const confirmarToggle = async () => {
    const r = await runAction(articulosService.setActivo(toggle.id, !toggle.activo), toggle.activo ? 'Artículo desactivado' : 'Artículo activado')
    if (r) { setToggle(null); reload() }
  }

  const columns = [
    { key: 'sku', header: 'SKU', mono: true },
    { key: 'nombre', header: 'Artículo', render: (a) => (
      <div><p className="font-medium">{a.nombre}</p><p className="text-xs text-ink-soft">{a.categoria}</p></div>
    ) },
    { key: 'stock', header: 'Stock', render: (a) => <StockBadge stock={a.stock} minimo={a.stock_minimo} unidad={a.unidad} /> },
    { key: 'stock_minimo', header: 'Mínimo', align: 'right', mono: true },
    { key: 'costo_unitario', header: 'Último costo', align: 'right', render: (a) => <MoneyCell value={a.costo_unitario} /> },
    { key: 'activo', header: 'Estado', render: (a) => <Badge tone={a.activo ? 'ok' : 'neutral'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge> },
    { key: 'acc', header: '', align: 'right', render: (a) => (
      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={History} label="Ver movimientos en Cardex" size="sm" onClick={() => onVerKardex(a.id)} />
        {gestiona && <IconButton icon={Pencil} label="Editar artículo" size="sm" onClick={() => setModal({ articulo: a })} />}
        {gestiona && <IconButton icon={Power} label={a.activo ? 'Desactivar artículo' : 'Activar artículo'} size="sm" onClick={() => setToggle(a)} />}
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Artículos activos" value={kpi(activos.length)} icon={Boxes} />
        <KpiTile label="Bajo stock mínimo" value={kpi(activos.filter((a) => a.estado_stock === 'BAJO').length)} icon={AlertTriangle} tone="warn" />
        <KpiTile label="Sin stock" value={kpi(activos.filter((a) => a.estado_stock === 'SIN_STOCK').length)} icon={PackageX} tone="crit" />
        <KpiTile label="Valor de inventario" value={!data || valor === null ? '—' : formatCLP(valor)} icon={Wallet} hint="Stock × último costo" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Input label="Buscar" placeholder="SKU o nombre" value={filtros.q} onChange={(e) => setFiltro('q', e.target.value)} className="w-full sm:w-56" />
          <Select label="Categoría" value={filtros.categoria} onChange={(e) => setFiltro('categoria', e.target.value)} placeholder="Todas" options={categorias.map((c) => ({ value: c, label: c }))} className="w-full sm:w-52" />
          <Select label="Stock" value={filtros.estado} onChange={(e) => setFiltro('estado', e.target.value)} placeholder="Todos"
            options={[{ value: 'BAJO', label: 'Bajo mínimo' }, { value: 'SIN_STOCK', label: 'Sin stock' }, { value: 'OK', label: 'Normal' }]} className="w-full sm:w-40" />
          <label className="flex h-10 items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={filtros.inactivos} onChange={(e) => setFiltro('inactivos', e.target.checked)} className="h-4 w-4 accent-brand" />
            Ver inactivos
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <Mono className="text-xs text-ink-soft">{filas.length} resultados</Mono>
            <ExportMenu nombre="inventario" titulo="Inventario" subtitulo="Stock derivado del Cardex" columnas={COLS_EXPORT} filas={filas} />
            {gestiona && <Button icon={Plus} onClick={() => setModal({})}>Nuevo artículo</Button>}
          </div>
        </div>
        <DataTable columns={columns} rows={filas} rowKey={(a) => a.id} loading={loading && !data} emptyTitle="Sin artículos" emptyHint="Ajusta los filtros de búsqueda." />
      </Card>

      {modal && <ArticuloModal open onClose={() => setModal(null)} articulo={modal.articulo} categorias={categorias} onSaved={reload} />}
      <ConfirmDialog
        open={Boolean(toggle)}
        onClose={() => setToggle(null)}
        onConfirm={confirmarToggle}
        title={toggle?.activo ? 'Desactivar artículo' : 'Activar artículo'}
        message={toggle?.activo
          ? `${toggle?.sku} dejará de aparecer para nuevos movimientos. Su historial en el Cardex se conserva.`
          : `${toggle?.sku} volverá a estar disponible para movimientos.`}
        confirmLabel={toggle?.activo ? 'Desactivar' : 'Activar'}
      />
    </div>
  )
}
