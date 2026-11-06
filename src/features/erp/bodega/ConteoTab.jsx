import { useState } from 'react'
import { ClipboardCheck, Plus, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, DataTable, Badge, Modal, Select, NumberField, Input, Mono } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { ErrorEstado } from '@/components/ErrorEstado'
import { conteosService, articulosService } from '@/services'
import { ESTADO_CONTEO_LABEL, puedeAprobarConteo } from '@/domain/conteo'
import { formatFechaHora, conSigno } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

const TONO = { CONFORME: 'ok', PENDIENTE: 'warn', APROBADO: 'info', RECHAZADO: 'crit' }

/** Conteo ciego: solo se pide lo que se encontró; el sistema compara y, si hay diferencia, pide motivo. */
export function NuevoConteoModal({ open, onClose, articuloInicial = '', onSaved }) {
  const { data: articulos } = useResource(() => articulosService.list(), [])
  const [form, setForm] = useState({ articulo_id: articuloInicial, contado: null, motivo: '' })
  const [pideMotivo, setPideMotivo] = useState(null) // diferencia detectada por el sistema
  const [guardando, setGuardando] = useState(false)
  const art = (articulos ?? []).find((a) => a.id === form.articulo_id)

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await conteosService.registrar(form)
      toast.success(r.estado === 'CONFORME' ? 'Conteo conforme: coincide con el sistema.' : `Diferencia de ${conSigno(r.diferencia)} ${art?.unidad ?? ''}: queda por aprobar.`)
      onSaved(); onClose()
    } catch (e) {
      if (e.data?.diferencia !== undefined && e.data.diferencia !== 0) setPideMotivo(e.data.diferencia)
      toast.error(e.message)
    } finally { setGuardando(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo conteo físico"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={guardando} disabled={!art || form.contado === null || form.contado === undefined} onClick={guardar}>Registrar conteo</Button></>}>
      <div className="space-y-4">
        <Select label="Artículo" placeholder="Elige el artículo" value={form.articulo_id} onChange={(e) => { setForm({ ...form, articulo_id: e.target.value }); setPideMotivo(null) }}
          options={(articulos ?? []).filter((a) => a.activo).map((a) => ({ value: a.id, label: `${a.sku} · ${a.nombre}` }))} />
        <NumberField label="Cantidad contada" min={0} suffix={art?.unidad} value={form.contado} onChange={(v) => { setForm({ ...form, contado: v }); setPideMotivo(null) }}
          hint="Cuenta lo que hay físicamente. El stock del sistema no se muestra para que el conteo sea imparcial." />
        {pideMotivo !== null && (
          <div className="space-y-2 rounded-lg bg-warn-bg p-3">
            <p className="text-sm font-semibold text-warn">Lo contado no coincide con el sistema (diferencia de {conSigno(pideMotivo)} {art?.unidad}).</p>
            <Input label="Motivo de la diferencia" autoFocus value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} hint="Ej.: rotura, merma, error de registro. Otra persona deberá aprobar el ajuste." />
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ConteoTab({ articuloInicial = '' }) {
  const user = useAuthStore((s) => s.user)
  const registra = can(user.rol, 'conteo.registrar')
  const aprueba = can(user.rol, 'conteo.aprobar')
  const { data, loading, error, reload } = useResource(() => conteosService.list(), [])
  const [modal, setModal] = useState(Boolean(articuloInicial))
  const [rechazo, setRechazo] = useState(null)

  const aprobar = async (c) => { if (await runAction(conteosService.aprobar(c.id), `Ajuste aprobado: ${c.articulo_sku} queda en ${c.contado}`)) reload() }
  const rechazar = async () => {
    if (await runAction(conteosService.rechazar(rechazo.conteo.id, rechazo.motivo), 'Ajuste rechazado')) { setRechazo(null); reload() }
  }

  const columns = [
    { key: 'fecha', header: 'Fecha', mono: true, render: (c) => formatFechaHora(c.fecha) },
    { key: 'articulo', header: 'Artículo', render: (c) => <div><p className="font-medium">{c.articulo_nombre}</p><p className="font-mono text-xs text-ink-soft">{c.articulo_sku}</p></div> },
    { key: 'contado', header: 'Contado', align: 'right', render: (c) => <Mono>{c.contado} {c.unidad}</Mono> },
    ...(aprueba ? [{ key: 'sistema', header: 'Sistema', align: 'right', render: (c) => <Mono>{c.stock_sistema} {c.unidad}</Mono> }] : []),
    { key: 'dif', header: 'Diferencia', align: 'right', render: (c) => (c.diferencia ? <Mono className={c.diferencia < 0 ? 'text-crit' : 'text-ok'}>{conSigno(c.diferencia)} {c.unidad}</Mono> : <span className="text-ink-faint">—</span>) },
    { key: 'valor', header: 'Valor', align: 'right', render: (c) => (c.valor_diferencia ? <MoneyCell value={c.valor_diferencia} /> : <span className="text-ink-faint">—</span>) },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={TONO[c.estado]}>{ESTADO_CONTEO_LABEL[c.estado]}</Badge> },
    { key: 'detalle', header: 'Detalle', render: (c) => (
      <div className="max-w-[14rem] text-xs text-ink-soft">
        {c.motivo && <p className="truncate" title={c.motivo}>{c.motivo}</p>}
        {c.motivo_rechazo && <p className="text-crit">Rechazo: {c.motivo_rechazo}</p>}
        <p className="text-ink-faint">Contó {c.creado_por_nombre}</p>
      </div>
    ) },
    { key: 'acc', header: '', align: 'right', render: (c) => aprueba && puedeAprobarConteo(c, user.id) && (
      <div className="flex justify-end gap-1">
        <Button size="sm" icon={Check} onClick={() => aprobar(c)}>Aprobar ajuste</Button>
        <Button size="sm" variant="secondary" icon={X} onClick={() => setRechazo({ conteo: c, motivo: '' })}>Rechazar</Button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-brand-tint p-4 text-sm">
        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-ink-soft"><span className="font-semibold text-ink">Conteo ciego con aprobación.</span> Quien cuenta no ve el stock del sistema. Si hay diferencia, <b>otra persona</b> aprueba el ajuste y recién entonces se corrige el stock con un movimiento auditado en el Cardex.</p>
      </div>
      <Card padded={false}>
        {error ? <ErrorEstado error={error} onReintentar={reload} /> : (
          <>
            <div className="flex items-center justify-end gap-3 border-b border-line p-4">
              <Mono className="text-xs text-ink-soft">{data?.length ?? 0} conteos</Mono>
              {registra && <Button icon={Plus} onClick={() => setModal(true)}>Nuevo conteo</Button>}
            </div>
            <DataTable columns={columns} rows={data ?? []} rowKey={(c) => c.id} loading={loading && !data} emptyTitle="Sin conteos" emptyHint="Cuenta un artículo para comparar el stock físico con el del sistema." />
          </>
        )}
      </Card>
      {modal && <NuevoConteoModal open onClose={() => setModal(false)} articuloInicial={articuloInicial} onSaved={reload} />}
      <Modal open={Boolean(rechazo)} onClose={() => setRechazo(null)} title="Rechazar ajuste"
        footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button><Button variant="danger" disabled={!rechazo?.motivo.trim()} onClick={rechazar}>Rechazar</Button></>}>
        {rechazo && <Input label="Motivo del rechazo" autoFocus value={rechazo.motivo} onChange={(e) => setRechazo({ ...rechazo, motivo: e.target.value })} hint="Por ejemplo: «recontar, parece un error de conteo»." />}
      </Modal>
    </div>
  )
}
