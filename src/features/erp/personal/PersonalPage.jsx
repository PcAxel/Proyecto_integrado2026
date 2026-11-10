import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, Wallet, ShieldAlert, Pencil, Power, Truck, Gauge, Wrench, X, Plus, FileCheck2, History } from 'lucide-react'
import { PageHeader, Tabs, Card, DataTable, KpiTile, Badge, Mono, IconButton, Modal, Button, NumberField, ConfirmDialog, ExportMenu } from '@/components/ui'
import { MoneyCell, VencimientoBadge } from '@/components/domain'
import { personalService, flotaService } from '@/services'
import { formatCLP } from '@/domain/money'
import { normalizar } from '@/domain/busqueda'
import { formatKm, resumenFlota, ESTADOS_VEHICULO } from '@/domain/flota'
import { formatFecha, fechaLocal } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { ListaAlertas } from '../dashboard/Charts'
import { AsistenciaHoy } from './AsistenciaHoy'
import { VehiculoModal, DocumentoModal, KmModal, HistorialModal } from './GestionFlota'

const COLS_FICHAS = [
  { titulo: 'Código', clave: 'id' }, { titulo: 'Nombre', clave: 'nombre', ancho: 26 }, { titulo: 'RUT', clave: 'rut' }, { titulo: 'Cargo', clave: 'cargo', ancho: 28 },
  { titulo: 'Ingreso', clave: 'fecha_ingreso', tipo: 'fecha' }, { titulo: 'Costo hora-hombre', clave: 'costo_hora_hombre', tipo: 'moneda' },
  { titulo: 'Venc. licencia', clave: 'vencimiento_licencia', tipo: 'fecha' }, { titulo: 'Estado', clave: (p) => (p.activo ? 'Activo' : 'Inactivo') },
]
const COLS_FLOTA = [
  { titulo: 'Código', clave: 'id' }, { titulo: 'Patente', clave: 'patente' }, { titulo: 'Marca', clave: 'marca' }, { titulo: 'Modelo', clave: 'modelo', ancho: 22 },
  { titulo: 'Asignado a', clave: 'tecnico_nombre', ancho: 24 }, { titulo: 'Kilometraje actual', clave: 'km_actual', tipo: 'numero' },
  { titulo: 'Estado', clave: (v) => (v.estado === 'EN_TALLER' ? 'En taller' : 'Activo') },
  { titulo: 'Última revisión (hecha)', clave: 'ultima_revision', tipo: 'fecha' }, { titulo: 'Revisión técnica (vence)', clave: 'vencimiento_revision', tipo: 'fecha' },
  { titulo: 'Permiso de circulación (vence)', clave: 'vencimiento_permiso', tipo: 'fecha' }, { titulo: 'Seguro (vence)', clave: 'vencimiento_seguro', tipo: 'fecha' },
]

export function PersonalPage() {
  const rol = useAuthStore((s) => s.user.rol)
  const gestiona = can(rol, 'personal.editar')
  // La flota la administran RR. HH. y el Administrador (los mismos roles que entran a Contratos y Finiquitos); el servidor lo exige igualmente.
  const gestionaFlota = can(rol, 'rrhh.ver')
  const veAsistencia = can(rol, 'asistencia.ver')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'fichas'
  const buscar = params.get('buscar') ?? ''
  const coincide = (...textos) => !buscar || normalizar(textos.join(' ')).includes(normalizar(buscar))
  const [tarifa, setTarifa] = useState(null) // { ficha, valor }
  const [toggle, setToggle] = useState(null)
  const [taller, setTaller] = useState(null)
  const [vehiculoModal, setVehiculoModal] = useState(null) // { vehiculo? }
  const [docModal, setDocModal] = useState(null)
  const [kmModal, setKmModal] = useState(null)
  const [histModal, setHistModal] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const hoy = fechaLocal()

  const fichas = useResource(() => personalService.list({ incluirInactivos: true }), [])
  const flota = useResource(() => flotaService.listar(), []) // tablas relacionales de la flota (fuente de verdad)
  const alertas = useResource(() => personalService.alertas(), [])
  const activos = (fichas.data ?? []).filter((p) => p.activo)
  const resumen = resumenFlota(flota.data ?? [])
  const promedio = activos.length ? activos.reduce((s, p) => s + p.costo_hora_hombre, 0) / activos.length : 0
  const vencidas = (alertas.data ?? []).filter((a) => a.severidad === 'CRITICA').length

  const guardarTarifa = async () => {
    setGuardando(true)
    const r = await runAction(personalService.actualizarTarifa(tarifa.ficha.id, tarifa.valor), 'Tarifa actualizada (aplica a hojas futuras)')
    setGuardando(false)
    if (r) { setTarifa(null); fichas.reload() }
  }
  const tras = () => { flota.reload(); alertas.reload() }
  const tecnicos = activos.filter((p) => p.usuario_id).map((p) => ({ value: Number(String(p.usuario_id).slice(2)), label: p.nombre }))
  const confirmarTaller = async () => {
    const nuevo = taller.estado === ESTADOS_VEHICULO.ACTIVO ? ESTADOS_VEHICULO.EN_TALLER : ESTADOS_VEHICULO.ACTIVO
    const r = await runAction(flotaService.actualizar(taller.id, { estado: nuevo }), nuevo === 'EN_TALLER' ? `${taller.patente} enviado a taller` : `${taller.patente} vuelve a estar activo`)
    if (r) { setTaller(null); flota.reload() }
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
    { key: 'patente', header: 'Patente', render: (v) => <Mono className="font-semibold tracking-wide">{v.patente}</Mono> },
    { key: 'vehiculo', header: 'Marca / Modelo', render: (v) => <span className="font-medium">{v.marca} {v.modelo}</span> },
    { key: 'tecnico_nombre', header: 'Asignado a' },
    { key: 'km_actual', header: 'Kilometraje actual', align: 'right', render: (v) => <Mono>{formatKm(v.km_actual)}</Mono> },
    { key: 'estado', header: 'Estado', render: (v) => (v.estado === ESTADOS_VEHICULO.ACTIVO
      ? <Badge tone="ok">Activo</Badge>
      : <Badge tone="warn" icon={Wrench}>En taller</Badge>) },
    { key: 'ultrev', header: 'Revisión hecha', render: (v) => (v.ultima_revision ? <Mono className="text-xs">{formatFecha(v.ultima_revision)}</Mono> : <span className="text-ink-faint">—</span>) },
    { key: 'rev', header: 'Revisión técnica', render: (v) => <VencimientoBadge fecha={v.vencimiento_revision} hoy={hoy} /> },
    { key: 'per', header: 'Permiso circ.', render: (v) => <VencimientoBadge fecha={v.vencimiento_permiso} hoy={hoy} /> },
    { key: 'seg', header: 'Seguro', render: (v) => <VencimientoBadge fecha={v.vencimiento_seguro} hoy={hoy} /> },
    { key: 'acc', header: '', align: 'right', render: (v) => (
      <div className="flex justify-end gap-1">
        <IconButton icon={History} label="Ver historial" size="sm" onClick={() => setHistModal(v)} />
        {gestionaFlota && <>
          <IconButton icon={FileCheck2} label="Registrar revisión o documento" size="sm" onClick={() => setDocModal(v)} />
          <IconButton icon={Gauge} label="Actualizar kilometraje" size="sm" onClick={() => setKmModal(v)} />
          <IconButton icon={Pencil} label="Editar vehículo" size="sm" onClick={() => setVehiculoModal({ vehiculo: v })} />
          <IconButton icon={Wrench} label={v.estado === ESTADOS_VEHICULO.ACTIVO ? 'Enviar a taller' : 'Marcar como activo'} size="sm" onClick={() => setTaller(v)} />
        </>}
      </div>
    ) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Personal y Flota" subtitle="Fichas con tarifa hora-hombre, vehículos y vencimientos"
        actions={tab === 'fichas'
          ? <ExportMenu nombre="personal" titulo="Personal" subtitulo="Fichas y tarifas hora-hombre" columnas={COLS_FICHAS} filas={fichas.data ?? []} />
          : tab === 'flota' ? <div className="flex flex-wrap items-center gap-2">
            <ExportMenu nombre="flota" titulo="Flota" subtitulo="Vehículos y vencimientos" columnas={COLS_FLOTA} filas={flota.data ?? []} />
            {gestionaFlota && <Button icon={Plus} onClick={() => setVehiculoModal({})}>Nuevo vehículo</Button>}
          </div> : null} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <KpiTile label="Técnicos activos" value={fichas.data ? activos.length : '—'} icon={Users} hint={`de ${fichas.data?.length ?? '—'} en dotación`} />
        <KpiTile label="Tarifa promedio" value={fichas.data ? formatCLP(promedio) : '—'} icon={Wallet} hint="Costo hora-hombre" />
        <KpiTile label="Vehículos operativos" value={flota.data ? resumen.operativos : '—'} icon={Truck} tone={resumen.enTaller ? 'warn' : 'ok'} hint={`${resumen.enTaller} en taller`} />
        <KpiTile label="Kilometraje de la flota" value={flota.data ? formatKm(resumen.kmTotal) : '—'} icon={Gauge} hint="Suma de odómetros" />
        <KpiTile label="Vencimientos vencidos" value={alertas.data ? vencidas : '—'} icon={ShieldAlert} tone={vencidas ? 'crit' : 'ok'} hint="Licencias, revisión y seguros" />
      </div>

      <Tabs value={tab} onChange={(t) => setParams(buscar ? { tab: t, buscar } : { tab: t })} tabs={[
        { id: 'fichas', label: 'Fichas', count: fichas.data?.length },
        ...(veAsistencia ? [{ id: 'asistencia', label: 'Asistencia de hoy' }] : []),
        { id: 'flota', label: 'Flota', count: flota.data?.length }, { id: 'alertas', label: 'Alertas', count: alertas.data?.length },
      ]} />

      {buscar && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft">Filtrando por</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 font-medium text-brand">«{buscar}»
            <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-white" onClick={() => setParams({ tab })}><X className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      )}
      {tab === 'fichas' && <Card padded={false}><DataTable columns={colsFichas} rows={(fichas.data ?? []).filter((p) => coincide(p.nombre, p.rut, p.cargo, p.id))} rowKey={(p) => p.id} loading={fichas.loading && !fichas.data} /></Card>}
      {tab === 'flota' && <Card padded={false}><DataTable columns={colsFlota} rows={(flota.data ?? []).filter((v) => coincide(v.patente, v.marca, v.modelo, v.tecnico_nombre))} rowKey={(v) => v.id} loading={flota.loading && !flota.data} /></Card>}
      {tab === 'asistencia' && veAsistencia && <AsistenciaHoy />}
      {tab === 'alertas' && <Card title="Próximos vencimientos (60 días)">{alertas.data && <ListaAlertas alertas={alertas.data} />}</Card>}

      {vehiculoModal && <VehiculoModal vehiculo={vehiculoModal.vehiculo} tecnicos={tecnicos} onClose={() => setVehiculoModal(null)} onSaved={tras} />}
      {docModal && <DocumentoModal vehiculo={docModal} onClose={() => setDocModal(null)} onSaved={tras} />}
      {kmModal && <KmModal vehiculo={kmModal} onClose={() => setKmModal(null)} onSaved={tras} />}
      {histModal && <HistorialModal vehiculo={histModal} onClose={() => setHistModal(null)} />}
      <Modal open={Boolean(tarifa)} onClose={() => setTarifa(null)} title={`Tarifa de ${tarifa?.ficha.nombre ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setTarifa(null)}>Cancelar</Button><Button loading={guardando} disabled={!(tarifa?.valor > 0) || tarifa?.valor === tarifa?.ficha.costo_hora_hombre} onClick={guardarTarifa}>Guardar tarifa</Button></>}>
        {tarifa && <div className="space-y-4">
          <NumberField label="Costo hora-hombre" prefix="$" min={1} value={tarifa.valor} onChange={(v) => setTarifa({ ...tarifa, valor: v })} hint={`Actual: ${formatCLP(tarifa.ficha.costo_hora_hombre)}`} />
          <p className="rounded-lg bg-brand-tint p-3 text-xs text-ink-soft">El cambio solo afecta hojas de servicio <b>futuras</b>: las ya sincronizadas conservan la tarifa con que se imputaron. Queda registrado en la auditoría.</p>
        </div>}
      </Modal>
      <ConfirmDialog open={Boolean(taller)} onClose={() => setTaller(null)} onConfirm={confirmarTaller}
        confirmLabel={taller?.estado === ESTADOS_VEHICULO.ACTIVO ? 'Enviar a taller' : 'Marcar activo'}
        title={taller?.estado === ESTADOS_VEHICULO.ACTIVO ? `Enviar ${taller?.patente} a taller` : `Reactivar ${taller?.patente}`}
        message={taller?.estado === ESTADOS_VEHICULO.ACTIVO ? 'El vehículo dejará de aparecer en la app de terreno hasta que lo marques como activo. Queda registrado en la auditoría.' : 'El vehículo volverá a estar disponible para los técnicos en la app de terreno.'} />
      <ConfirmDialog open={Boolean(toggle)} onClose={() => setToggle(null)} onConfirm={confirmarToggle} confirmLabel={toggle?.activo ? 'Desactivar' : 'Activar'}
        title={toggle?.activo ? 'Desactivar ficha' : 'Activar ficha'} message={toggle?.activo ? `${toggle?.nombre} dejará de aparecer como asignable. Su historial se conserva.` : `${toggle?.nombre} volverá a estar disponible.`} />
    </div>
  )
}
