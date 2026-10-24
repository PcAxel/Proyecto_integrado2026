import { useState } from 'react'
import { Lock, Undo2, PackagePlus, ArrowUpFromLine } from 'lucide-react'
import { Button, Select, DataTable, Card, Badge, Mono, Pagination, ExportMenu } from '@/components/ui'
import { CardexTypeBadge, MoneyCell, TIPO_MOV_LABEL } from '@/components/domain'
import { cardexService, articulosService, obrasService } from '@/services'
import { USUARIOS_DEMO } from '@/mocks/usuarios'
import { formatFechaHora, conSigno } from '@/domain/format'
import { valorMovimiento } from '@/domain/cardex'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { MovimientoModal } from './MovimientoModal'
import { ReversaModal } from './ReversaModal'
import { ReingresoModal } from './ReingresoModal'

const PAGE = 15
const usuarioNombre = (id) => USUARIOS_DEMO.find((u) => u.id === id)?.nombre ?? id

export function CardexTab({ articuloId, onArticuloChange }) {
  const rol = useAuthStore((s) => s.user.rol)
  const [tipo, setTipo] = useState('')
  const [obraId, setObraId] = useState('')
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState(null) // { tipo: 'salida'|'reversa'|'reingreso', mov? }

  const { data, loading, reload } = useResource(
    () => Promise.all([
      cardexService.list({ articulo_id: articuloId || undefined, tipo: tipo || undefined, obra_id: obraId || undefined }),
      articulosService.list({ incluirInactivos: true }),
      obrasService.list(),
    ]),
    [articuloId, tipo, obraId],
  )
  const [movs, articulos, obras] = data ?? [[], [], []]
  const nombre = (id) => articulos.find((a) => a.id === id)?.nombre ?? id
  const sku = (id) => articulos.find((a) => a.id === id)?.sku ?? id
  const visibles = movs.slice(page * PAGE, (page + 1) * PAGE)

  const columns = [
    { key: 'id', header: 'Código', mono: true, render: (m) => <span className={m.reversado ? 'text-ink-faint line-through' : ''}>{m.id}</span> },
    { key: 'fecha', header: 'Fecha', mono: true, render: (m) => formatFechaHora(m.fecha) },
    { key: 'tipo', header: 'Tipo', render: (m) => <CardexTypeBadge tipo={m.tipo} /> },
    { key: 'articulo', header: 'Artículo', render: (m) => (
      <div><p className="font-medium">{nombre(m.articulo_id)}</p><p className="font-mono text-xs text-ink-soft">{sku(m.articulo_id)}</p></div>
    ) },
    { key: 'cantidad', header: 'Cantidad', align: 'right', render: (m) => (
      <Mono className={m.signo > 0 ? 'text-ok' : 'text-ink'}>{conSigno(m.signo * m.cantidad)}</Mono>
    ) },
    { key: 'costo_unitario', header: 'Costo unit.', align: 'right', render: (m) => <MoneyCell value={m.costo_unitario} /> },
    { key: 'valor', header: 'Valor', align: 'right', render: (m) => <MoneyCell value={m.costo_unitario === undefined ? undefined : valorMovimiento(m)} /> },
    { key: 'obra_id', header: 'Obra', mono: true, render: (m) => m.obra_id ?? '—' },
    { key: 'detalle', header: 'Detalle', render: (m) => (
      <div className="max-w-[16rem]">
        {m.reversado && <Badge tone="warn">Reversado</Badge>}
        {m.reversa_de && <p className="text-xs text-ink-soft">Reversa de <Mono>{m.reversa_de}</Mono></p>}
        <p className="truncate text-xs text-ink-soft" title={m.referencia}>{m.referencia}</p>
        <p className="text-xs text-ink-faint">{usuarioNombre(m.usuario_id)}</p>
      </div>
    ) },
    { key: 'acc', header: '', align: 'right', render: (m) => (
      <div className="flex justify-end gap-1">
        {can(rol, 'cardex.reingresar') && m.tipo === 'SALIDA_OBRA' && m.reingresable > 0 && (
          <Button size="sm" variant="secondary" icon={PackagePlus} onClick={() => setModal({ tipo: 'reingreso', mov: m })}>Reingresar</Button>
        )}
        {can(rol, 'cardex.reversar') && m.tipo !== 'REVERSA' && !m.reversado && (
          <Button size="sm" variant="secondary" icon={Undo2} onClick={() => setModal({ tipo: 'reversa', mov: m })}>Reversar</Button>
        )}
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-brand-tint p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-ink-soft">
          <span className="font-semibold text-ink">Libro inmutable.</span> Los movimientos no se editan ni se eliminan. Los errores se corrigen con una <b>Reversa</b> auditada y los sobrantes con un <b>Reingreso</b>.
        </p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Select label="Artículo" value={articuloId} onChange={(e) => { onArticuloChange(e.target.value); setPage(0) }} placeholder="Todos" className="w-full sm:w-72"
            options={articulos.map((a) => ({ value: a.id, label: `${a.sku} · ${a.nombre}` }))} />
          <Select label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(0) }} placeholder="Todos" className="w-full sm:w-48"
            options={Object.entries(TIPO_MOV_LABEL).map(([value, label]) => ({ value, label }))} />
          <Select label="Obra" value={obraId} onChange={(e) => { setObraId(e.target.value); setPage(0) }} placeholder="Todas" className="w-full sm:w-56"
            options={obras.map((o) => ({ value: o.id, label: o.id }))} />
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <ExportMenu nombre="cardex" titulo="Cardex" subtitulo="Libro de movimientos (inmutable)" filas={movs} columnas={[
            { titulo: 'Código', clave: 'id' }, { titulo: 'Fecha', clave: 'fecha', tipo: 'fechaHora', ancho: 18 }, { titulo: 'Tipo', clave: (m) => TIPO_MOV_LABEL[m.tipo], ancho: 20 },
            { titulo: 'SKU', clave: (m) => sku(m.articulo_id) }, { titulo: 'Artículo', clave: (m) => nombre(m.articulo_id), ancho: 34 }, { titulo: 'Cantidad', clave: (m) => m.signo * m.cantidad, tipo: 'numero' },
            { titulo: 'Costo unitario', clave: 'costo_unitario', tipo: 'moneda' }, { titulo: 'Valor', clave: (m) => (m.costo_unitario === undefined ? null : valorMovimiento(m)), tipo: 'moneda' },
            { titulo: 'Obra', clave: 'obra_id' }, { titulo: 'Usuario', clave: (m) => usuarioNombre(m.usuario_id), ancho: 22 }, { titulo: 'Referencia', clave: 'referencia', ancho: 30 }, { titulo: 'Reversado', clave: (m) => (m.reversado ? 'Sí' : '') },
          ]} />
          {can(rol, 'cardex.crear') && (
            <Button icon={ArrowUpFromLine} onClick={() => setModal({ tipo: 'salida' })}>Nueva salida a obra</Button>
          )}
          </div>
        </div>
        <DataTable columns={columns} rows={visibles} rowKey={(m) => m.id} loading={loading && !data} emptyTitle="Sin movimientos" emptyHint="No hay movimientos para los filtros elegidos." />
        <Pagination page={page} pageSize={PAGE} total={movs.length} onChange={setPage} />
      </Card>

      {modal?.tipo === 'salida' && <MovimientoModal open onClose={() => setModal(null)} articulos={articulos} obras={obras} articuloInicial={articuloId} onSaved={reload} />}
      {modal?.tipo === 'reversa' && <ReversaModal open onClose={() => setModal(null)} movimiento={modal.mov} nombreArticulo={nombre(modal.mov.articulo_id)} onSaved={reload} />}
      {modal?.tipo === 'reingreso' && <ReingresoModal open onClose={() => setModal(null)} movimiento={modal.mov} nombreArticulo={nombre(modal.mov.articulo_id)} onSaved={reload} />}
    </div>
  )
}
