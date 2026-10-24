import { useMemo, useState } from 'react'
import { ScrollText, Lock, Users, Layers } from 'lucide-react'
import { PageHeader, Card, DataTable, KpiTile, Select, Input, Badge, Mono, Drawer, Pagination, ExportMenu } from '@/components/ui'
import { auditoriaService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { useResource } from '@/hooks/useResource'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'

const PAGE = 20
const json = (v) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2))
const COLS_EXPORT = [
  { titulo: 'Código', clave: 'id' }, { titulo: 'Fecha y hora', clave: 'fecha', tipo: 'fechaHora', ancho: 20 }, { titulo: 'Usuario', clave: 'usuario_nombre', ancho: 22 }, { titulo: 'Rol', clave: 'rol' },
  { titulo: 'Entidad', clave: 'entidad', ancho: 20 }, { titulo: 'ID entidad', clave: 'entidad_id' }, { titulo: 'Acción', clave: 'accion', ancho: 20 },
  { titulo: 'Valor anterior', clave: (l) => (l.anterior ? JSON.stringify(l.anterior) : ''), ancho: 36 }, { titulo: 'Valor nuevo', clave: (l) => (l.nuevo ? JSON.stringify(l.nuevo) : ''), ancho: 36 }, { titulo: 'IP', clave: 'ip' },
]

/** Log de auditoría: solo lectura, con filtros y detalle de valor anterior/nuevo. */
export function AuditoriaPage() {
  const [f, setF] = usePersistedFilters('auditoria', { entidad: '', usuario_id: '', accion: '', desde: '', hasta: '' })
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState(null)
  const todos = useResource(() => auditoriaService.list(), [])
  const { data, loading } = useResource(() => auditoriaService.list(f), [f.entidad, f.usuario_id, f.accion, f.desde, f.hasta])
  const opciones = useMemo(() => {
    const all = todos.data ?? []
    const uniq = (fn) => [...new Map(all.map((l) => [fn(l)[0], fn(l)[1]])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    return { entidades: uniq((l) => [l.entidad, l.entidad]), usuarios: uniq((l) => [l.usuario_id, l.usuario_nombre]), acciones: uniq((l) => [l.accion, l.accion]) }
  }, [todos.data])
  const filas = data ?? []
  const cambiar = (campo) => (e) => { setF(campo, e.target.value); setPage(0) }

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha y hora', mono: true, render: (l) => formatFechaHora(l.fecha) },
    { key: 'usuario', header: 'Usuario', render: (l) => <div><p>{l.usuario_nombre}</p><p className="text-xs text-ink-soft">{l.rol}</p></div> },
    { key: 'entidad', header: 'Entidad', render: (l) => <span>{l.entidad} <Mono className="text-xs text-ink-soft">{l.entidad_id}</Mono></span> },
    { key: 'accion', header: 'Acción', render: (l) => <Badge tone="neutral">{l.accion}</Badge> },
    { key: 'ip', header: 'IP', mono: true },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Log de Auditoría" subtitle="Quién cambió qué, cuándo y desde dónde" actions={<ExportMenu nombre="log-auditoria" titulo="Log de auditoría" subtitulo={`${filas.length} registros`} columnas={COLS_EXPORT} filas={filas} />} />
      <div className="flex items-start gap-3 rounded-xl border border-line bg-brand-tint p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-ink-soft"><span className="font-semibold text-ink">Registro de solo lectura.</span> Cada cambio de datos genera una entrada que no puede editarse ni eliminarse.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiTile label="Registros (con filtros)" value={data ? filas.length : '—'} icon={ScrollText} />
        <KpiTile label="Usuarios distintos" value={data ? new Set(filas.map((l) => l.usuario_id)).size : '—'} icon={Users} />
        <KpiTile label="Entidades distintas" value={data ? new Set(filas.map((l) => l.entidad)).size : '—'} icon={Layers} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Select label="Entidad" value={f.entidad} onChange={cambiar('entidad')} placeholder="Todas" className="w-full sm:w-48" options={opciones.entidades.map(([value, label]) => ({ value, label }))} />
          <Select label="Usuario" value={f.usuario_id} onChange={cambiar('usuario_id')} placeholder="Todos" className="w-full sm:w-52" options={opciones.usuarios.map(([value, label]) => ({ value, label }))} />
          <Select label="Acción" value={f.accion} onChange={cambiar('accion')} placeholder="Todas" className="w-full sm:w-48" options={opciones.acciones.map(([value, label]) => ({ value, label }))} />
          <Input label="Desde" type="date" mono value={f.desde} onChange={cambiar('desde')} className="w-full sm:w-40" />
          <Input label="Hasta" type="date" mono value={f.hasta} onChange={cambiar('hasta')} className="w-full sm:w-40" />
        </div>
        <DataTable columns={columns} rows={filas.slice(page * PAGE, (page + 1) * PAGE)} rowKey={(l) => l.id} loading={loading && !data} onRowClick={setSel} emptyTitle="Sin registros" emptyHint="Ajusta los filtros." />
        <Pagination page={page} pageSize={PAGE} total={filas.length} onChange={setPage} />
      </Card>

      <Drawer open={Boolean(sel)} onClose={() => setSel(null)} title={sel ? `Registro ${sel.id}` : ''}>
        {sel && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[['Fecha y hora', <Mono key="f">{formatFechaHora(sel.fecha)}</Mono>], ['IP', <Mono key="i">{sel.ip}</Mono>], ['Usuario', `${sel.usuario_nombre} (${sel.rol})`], ['Acción', <Badge key="a" tone="neutral">{sel.accion}</Badge>], ['Entidad', `${sel.entidad}`], ['ID', <Mono key="e">{sel.entidad_id}</Mono>]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-ink-soft">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
            {[['Valor anterior', sel.anterior, 'bg-crit-bg'], ['Valor nuevo', sel.nuevo, 'bg-ok-bg']].map(([t, v, bg]) => (
              <div key={t}><p className="mb-1 text-xs font-medium text-ink-soft">{t}</p><pre className={`overflow-x-auto rounded-lg p-3 font-mono text-xs ${v ? bg : 'bg-slate-50 text-ink-faint'}`}>{json(v)}</pre></div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  )
}
