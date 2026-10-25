import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, Wallet, ShieldAlert, Pencil, Power } from 'lucide-react'
import { PageHeader, Tabs, Card, DataTable, KpiTile, Badge, Mono, IconButton, Modal, Button, NumberField, ConfirmDialog, ExportMenu } from '@/components/ui'
import { MoneyCell, VencimientoBadge } from '@/components/domain'
import { personalService } from '@/services'
import { formatCLP } from '@/domain/money'
import { formatFecha, fechaLocal } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { ListaAlertas } from '../dashboard/Charts'

const COLS_FICHAS = [
  { titulo: 'Código', clave: 'id' }, { titulo: 'Nombre', clave: 'nombre', ancho: 26 }, { titulo: 'RUT', clave: 'rut' }, { titulo: 'Cargo', clave: 'cargo', ancho: 28 },
  { titulo: 'Ingreso', clave: 'fecha_ingreso', tipo: 'fecha' }, { titulo: 'Costo hora-hombre', clave: 'costo_hora_hombre', tipo: 'moneda' },
  { titulo: 'Venc. licencia', clave: 'vencimiento_licencia', tipo: 'fecha' }, { titulo: 'Estado', clave: (p) => (p.activo ? 'Activo' : 'Inactivo') },
]
const COLS_FLOTA = [
  { titulo: 'Código', clave: 'id' }, { titulo: 'Patente', clave: 'patente' }, { titulo: 'Modelo', clave: 'modelo', ancho: 26 }, { titulo: 'Asignado a', clave: 'tecnico_nombre', ancho: 24 },
  { titulo: 'Revisión técnica', clave: 'vencimiento_revision', tipo: 'fecha' }, { titulo: 'Seguro', clave: 'vencimiento_seguro', tipo: 'fecha' },
]

export function PersonalPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const gestiona = can(rol, 'personal.editar')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'fichas'
  const [tarifa, setTarifa] = useState(null) // { ficha, valor }
  const [toggle, setToggle] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const hoy = fechaLocal()

  const fichas = useResource(() => personalService.list({ incluirInactivos: true }), [])
  const flota = useResource(() => personalService.listFlota(), [])
  const alertas = useResource(() => personalService.alertas(), [])
  const activos = (fichas.data ?? []).filter((p) => p.activo)
  const promedio = activos.length ? activos.reduce((s, p) => s + p.costo_hora_hombre, 0) / activos.length : 0
  const vencidas = (alertas.data ?? []).filter((a) => a.severidad === 'CRITICA').length

  const guardarTarifa = async () => {
    setGuardando(true)
    const r = await runAction(personalService.actualizarTarifa(tarifa.ficha.id, tarifa.valor), 'Tarifa actualizada (aplica a hojas futuras)')
    setGuardando(false)
    if (r) { setTarifa(null); fichas.reload() }
  }
  const confirmarToggle = async () => {
    const r = await runAction(personalService.setActivo(toggle.id, !toggle.activo), toggle.activo ? 'Ficha desactivada' : 'Ficha activada')
    if (r) { setToggle(null); fichas.reload() }
  }

  const colsFichas = [
    { key: 'nombre', header: 'Técnico', render: (p) => <div><p className="font-medium">{p.nombre}</p><p className="text-xs text-ink-soft">{p.cargo}</p></div> },
    { key: 'rut', header: 'RUT', mono: true },
    { key: 'fecha_ingreso', header: 'Ingreso', mono: true, render: (p) => formatFecha(p.fecha_ingreso) },
    { key: 'tarifa', header: 'Hora-hombre', align: 'right', render: (p) => <MoneyCell value={p.costo_hora_hombre} /> },
    { key: 'licencia', header: 'Licencia', render: (p) => <VencimientoBadge fecha={p.vencimiento_licencia} hoy={hoy} /> },
    { key: 'activo', header: 'Estado', render: (p) => <Badge tone={p.activo ? 'ok' : 'neutral'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge> },
    ...(gestiona ? [{ key: 'acc', header: '', align: 'right', render: (p) => (
      <div className="flex justify-end gap-0.5">
        <IconButton icon={Pencil} label="Editar tarifa hora-hombre" size="sm" onClick={() => setTarifa({ ficha: p, valor: p.costo_hora_hombre })} />
        <IconButton icon={Power} label={p.activo ? 'Desactivar ficha' : 'Activar ficha'} size="sm" onClick={() => setToggle(p)} />
      </div>
    ) }] : []),
  ]
  const colsFlota = [
    { key: 'patente', header: 'Patente', mono: true },
    { key: 'modelo', header: 'Vehículo' },
    { key: 'tecnico_nombre', header: 'Asignado a' },
    { key: 'rev', header: 'Revisión técnica', render: (v) => <VencimientoBadge fecha={v.vencimiento_revision} hoy={hoy} /> },
    { key: 'seg', header: 'Seguro obligatorio', render: (v) => <VencimientoBadge fecha={v.vencimiento_seguro} hoy={hoy} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Personal y Flota" subtitle="Fichas con tarifa hora-hombre, vehículos y vencimientos"
        actions={tab === 'fichas'
          ? <ExportMenu nombre="personal" titulo="Personal" subtitulo="Fichas y tarifas hora-hombre" columnas={COLS_FICHAS} filas={fichas.data ?? []} />
          : tab === 'flota' ? <ExportMenu nombre="flota" titulo="Flota" subtitulo="Vehículos y vencimientos" columnas={COLS_FLOTA} filas={flota.data ?? []} /> : null} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiTile label="Técnicos activos" value={fichas.data ? activos.length : '—'} icon={Users} hint="de 16 en dotación" />
        <KpiTile label="Tarifa promedio" value={fichas.data ? formatCLP(promedio) : '—'} icon={Wallet} hint="Costo hora-hombre" />
        <KpiTile label="Vencimientos vencidos" value={alertas.data ? vencidas : '—'} icon={ShieldAlert} tone={vencidas ? 'crit' : 'ok'} hint="Licencias, revisión y seguros" />
      </div>

      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { id: 'fichas', label: 'Fichas', count: fichas.data?.length }, { id: 'flota', label: 'Flota', count: flota.data?.length }, { id: 'alertas', label: 'Alertas', count: alertas.data?.length },
      ]} />

      {tab === 'fichas' && <Card padded={false}><DataTable columns={colsFichas} rows={fichas.data ?? []} rowKey={(p) => p.id} loading={fichas.loading && !fichas.data} /></Card>}
      {tab === 'flota' && <Card padded={false}><DataTable columns={colsFlota} rows={flota.data ?? []} rowKey={(v) => v.id} loading={flota.loading && !flota.data} /></Card>}
      {tab === 'alertas' && <Card title="Próximos vencimientos (60 días)">{alertas.data && <ListaAlertas alertas={alertas.data} />}</Card>}

      <Modal open={Boolean(tarifa)} onClose={() => setTarifa(null)} title={`Tarifa de ${tarifa?.ficha.nombre ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setTarifa(null)}>Cancelar</Button><Button loading={guardando} disabled={!(tarifa?.valor > 0) || tarifa?.valor === tarifa?.ficha.costo_hora_hombre} onClick={guardarTarifa}>Guardar tarifa</Button></>}>
        {tarifa && <div className="space-y-4">
          <NumberField label="Costo hora-hombre" prefix="$" min={1} value={tarifa.valor} onChange={(v) => setTarifa({ ...tarifa, valor: v })} hint={`Actual: ${formatCLP(tarifa.ficha.costo_hora_hombre)}`} />
          <p className="rounded-lg bg-brand-tint p-3 text-xs text-ink-soft">El cambio solo afecta hojas de servicio <b>futuras</b>: las ya sincronizadas conservan la tarifa con que se imputaron. Queda registrado en la auditoría.</p>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(toggle)} onClose={() => setToggle(null)} onConfirm={confirmarToggle} confirmLabel={toggle?.activo ? 'Desactivar' : 'Activar'}
        title={toggle?.activo ? 'Desactivar ficha' : 'Activar ficha'} message={toggle?.activo ? `${toggle?.nombre} dejará de aparecer como asignable. Su historial se conserva.` : `${toggle?.nombre} volverá a estar disponible.`} />
    </div>
  )
}
