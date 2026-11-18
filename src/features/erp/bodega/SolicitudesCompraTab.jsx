import { useMemo, useState } from 'react'
import { Plus, X, Sparkles, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Card, DataTable, Drawer, Button, Modal, NumberField, Textarea, IconButton, Mono } from '@/components/ui'
import { BuscadorRelacion } from '@/components/BuscadorRelacion'
import { EstadoSolicitudBadge } from '@/components/domain'
import { solicitudesCompraService, ordenesCompraService, articulosService, lotesService } from '@/services'
import { resolverCodigo } from '@/domain/etiquetas'
import { formatFechaHora } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { EscanerQr } from './EscanerQr'

const LINEA = () => ({ clave: Math.random().toString(36).slice(2), articulo_id: '', cantidad: null })

/** Cantidad sugerida para reponer un artículo: hasta el máximo si lo tiene, o el doble del mínimo. */
const sugerida = (a) => Math.max(Math.ceil((a.stock_maximo > 0 ? a.stock_maximo : a.stock_minimo * 2) - a.stock), 1)

function NuevaSolicitud({ open, onClose, onSaved }) {
  const { data: cat } = useResource(() => Promise.all([articulosService.list(), lotesService.list()]), [])
  const [articulos, lotes] = cat ?? [undefined, []]
  const [escaneando, setEscaneando] = useState(false) // el lector QR como buscador: apunta al repuesto y el formulario se completa solo
  const [lineas, setLineas] = useState([LINEA()])
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const activos = useMemo(() => (articulos ?? []).filter((a) => a.activo), [articulos])
  const repetidos = new Set(lineas.map((l) => l.articulo_id).filter((id, i, arr) => id && arr.indexOf(id) !== i))
  const valido = motivo.trim() && lineas.length > 0 && repetidos.size === 0 && lineas.every((l) => l.articulo_id && l.cantidad > 0)
  const cambiar = (clave, campo) => (v) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: v } : l)))

  /** Un código escaneado (QR del artículo o de su lote o cilindro) agrega ESE artículo a la solicitud, sin escribir su nombre. */
  const alEscanear = (texto) => {
    const r = resolverCodigo(texto, activos, lotes)
    if (!r.ok) { toast.error(r.error); return }
    const a = r.articulo
    if (lineas.some((l) => l.articulo_id === a.id)) { toast.info(`${a.sku} ya está en la solicitud.`); setEscaneando(false); return }
    setLineas((ls) => {
      const vacia = ls.findIndex((l) => !l.articulo_id)
      const nueva = { ...(vacia >= 0 ? ls[vacia] : LINEA()), articulo_id: a.id, cantidad: sugerida(a) }
      return vacia >= 0 ? ls.map((l, i) => (i === vacia ? nueva : l)) : [...ls, nueva]
    })
    toast.success(`Agregado: ${a.nombre}`)
    setEscaneando(false) // apaga la cámara; se puede volver a escanear otro repuesto
  }

  const cargarCriticos = () => {
    const bajos = activos.filter((a) => a.estado_stock !== 'OK')
    if (!bajos.length) return
    setLineas(bajos.slice(0, 30).map((a) => ({ ...LINEA(), articulo_id: a.id, cantidad: sugerida(a) })))
    if (!motivo.trim()) setMotivo('Reposición de artículos bajo el stock mínimo')
  }

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(solicitudesCompraService.create({ items: lineas.map(({ articulo_id, cantidad }) => ({ articulo_id, cantidad })), motivo }), 'Solicitud enviada a Finanzas')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud de compra" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={guardando} disabled={!valido} onClick={guardar}>Enviar a Finanzas</Button></>}>
      <div className="space-y-4">
        <Textarea label="¿Por qué se necesita?" obligatorio placeholder="Ej.: stock bajo el mínimo para las obras de la próxima semana" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <div className="space-y-3">
          {lineas.map((l, i) => {
            const a = activos.find((x) => x.id === l.articulo_id)
            return (
              <div key={l.clave} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                  <BuscadorRelacion tabla="articulos" label={i === 0 ? 'Artículo' : undefined} obligatorio={i === 0} aria-label={`Artículo ${i + 1}`} placeholder="Escribe el SKU o el nombre…" value={l.articulo_id} onChange={(id) => cambiar(l.clave, 'articulo_id')(id)} error={repetidos.has(l.articulo_id) ? 'Artículo repetido' : undefined} />
                  <NumberField label={i === 0 ? 'Cantidad' : undefined} obligatorio={i === 0} aria-label={`Cantidad ${i + 1}`} min={1} suffix={a?.unidad} value={l.cantidad} onChange={cambiar(l.clave, 'cantidad')} />
                  <IconButton icon={X} label="Quitar línea" size="sm" disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} />
                </div>
                {a && <p className="mt-2 text-xs text-ink-soft">Stock actual: <b>{a.stock} {a.unidad}</b> · mínimo {a.stock_minimo}{a.stock_maximo > 0 ? ` · máximo ${a.stock_maximo}` : ''}</p>}
              </div>
            )
          })}
        </div>
        {escaneando && (
          <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-tint/40 p-3">
            <p className="text-sm text-ink-soft">Apunta al QR del repuesto (o de su lote o cilindro): se agrega a la solicitud con ese producto exacto.</p>
            <EscanerQr onCodigo={alEscanear} compacto />
            <Button variant="ghost" size="sm" onClick={() => setEscaneando(false)}>Cerrar el lector</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, LINEA()])}>Agregar otro artículo</Button>
          <Button variant="secondary" size="sm" icon={ScanLine} onClick={() => setEscaneando((v) => !v)}>Escanear un repuesto</Button>
          <Button variant="ghost" size="sm" icon={Sparkles} onClick={cargarCriticos}>Cargar los que están bajo el mínimo</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Solicitudes de compra del Jefe de Bodega: las crea y sigue su estado (pendiente, aprobada con sus órdenes o rechazada con el motivo). */
export function SolicitudesCompraTab() {
  const rol = useAuthStore((s) => s.user.rol)
  const { data, loading, reload } = useResource(() => Promise.all([solicitudesCompraService.list(), ordenesCompraService.list()]), [])
  const [solicitudes, ordenes] = data ?? [[], []]
  const [sel, setSel] = useState(null)
  const [nueva, setNueva] = useState(false)
  const actual = sel && solicitudes.find((s) => s.id === sel)

  const columns = [
    { key: 'id', header: 'Código', mono: true },
    { key: 'fecha', header: 'Fecha', mono: true, render: (s) => formatFechaHora(s.fecha) },
    { key: 'motivo', header: 'Motivo', render: (s) => <span className="line-clamp-1 max-w-xs">{s.motivo}</span> },
    { key: 'items', header: 'Artículos', render: (s) => `${s.items.length} ítem(s)` },
    { key: 'estado', header: 'Estado', render: (s) => <EstadoSolicitudBadge estado={s.estado} /> },
  ]

  return (
    <>
      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="text-sm font-semibold">Solicitudes de compra a Finanzas</h2>
          {can(rol, 'solicitudes_compra.crear') && <Button icon={Plus} onClick={() => setNueva(true)}>Nueva solicitud</Button>}
        </div>
        <DataTable columns={columns} rows={solicitudes} rowKey={(s) => s.id} loading={loading && !data} onRowClick={(s) => setSel(s.id)}
          emptyTitle="Sin solicitudes" emptyHint="Cuando falte stock, solicita la compra a Finanzas desde aquí." />
      </Card>

      <Drawer open={Boolean(actual)} onClose={() => setSel(null)} title={actual ? `Solicitud ${actual.id}` : ''}>
        {actual && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><EstadoSolicitudBadge estado={actual.estado} /><Mono className="text-xs text-ink-soft">{formatFechaHora(actual.fecha)}</Mono></div>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">“{actual.motivo}”</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-soft"><th className="py-2 font-medium">Artículo</th><th className="py-2 text-right font-medium">Cantidad</th></tr></thead>
              <tbody>{actual.items.map((it) => (
                <tr key={it.articulo_id} className="border-b border-line last:border-0"><td className="py-2"><p>{it.nombre}</p><Mono className="text-xs text-ink-soft">{it.sku}</Mono></td><td className="py-2 text-right"><Mono>{it.cantidad} {it.unidad}</Mono></td></tr>
              ))}</tbody>
            </table>
            {actual.estado === 'RECHAZADA' && <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit">Motivo del rechazo: {actual.motivo_rechazo}</p>}
            {actual.estado === 'APROBADA' && (
              <p className="rounded-lg bg-ok-bg p-3 text-sm text-ok">Aprobada por {actual.resuelto_por_nombre}. Órdenes de compra: {actual.orden_ids.map((id) => {
                const o = ordenes.find((x) => x.id === id)
                return <Mono key={id} className="mr-2 font-semibold">{id}{o ? ` · ${o.proveedor_nombre}` : ''}</Mono>
              })}</p>
            )}
          </div>
        )}
      </Drawer>
      {nueva && <NuevaSolicitud open onClose={() => setNueva(false)} onSaved={reload} />}
    </>
  )
}
