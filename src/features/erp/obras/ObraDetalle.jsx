import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Play, AlertTriangle, MapPin, CalendarDays, Users, UserPlus } from 'lucide-react'
import { PageHeader, Tabs, Card, Button, Skeleton, Mono, ConfirmDialog, Modal } from '@/components/ui'
import { ObraStatusBadge, EmergencyBadge, TIPO_OBRA_LABEL, MoneyCell } from '@/components/domain'
import { obrasService, clientesService } from '@/services'
import { formatFecha } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { PanelCierre } from './PanelCierre'
import { CostosTab, MaterialesTab, HojasTab, AuditoriaTab } from './ObraTabs'
import { SelectorTecnicos } from './SelectorTecnicos'

export function ObraDetalle() {
  const { id } = useParams()
  const rol = useAuthStore((s) => s.user.rol)
  const [tab, setTab] = useState('resumen')
  const [iniciando, setIniciando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [asignando, setAsignando] = useState(null) // ids elegidos mientras el modal está abierto
  const obraRes = useResource(() => obrasService.retrieve(id), [id])
  const cliente = useResource(() => clientesService.retrieve(obraRes.data?.cliente_id ?? 'CLI-001').catch(() => null), [obraRes.data?.cliente_id])
  const obra = obraRes.data
  const puedeAsignar = Boolean(obra) && can(rol, 'obras.crear') && obra.estado !== 'FINALIZADA'
  const tecnicos = useResource(() => (puedeAsignar ? obrasService.tecnicosDisponibles() : Promise.resolve(null)), [puedeAsignar])

  if (obraRes.error) return <div className="card p-6 text-sm text-crit">{obraRes.error.message}</div>
  if (!obra) return <div className="card"><Skeleton rows={8} /></div>

  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    ...(obra.costo_real ? [{ id: 'costos', label: 'Costos' }] : []),
    ...(can(rol, 'bodega.ver') ? [{ id: 'materiales', label: 'Materiales' }] : []),
    ...(can(rol, 'terreno.ver') ? [{ id: 'hojas', label: 'Hojas de servicio' }] : []),
    { id: 'auditoria', label: 'Auditoría' },
  ]
  const supervisor = obra.supervisor_nombre

  const iniciar = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.iniciar(obra.id), 'Obra iniciada')
    setTrabajando(false)
    if (r) { setIniciando(false); obraRes.reload() }
  }

  const guardarAsignacion = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.asignarTecnicos(obra.id, asignando), 'Técnicos asignados actualizados')
    setTrabajando(false)
    if (r) { setAsignando(null); obraRes.reload() }
  }

  return (
    <div className="space-y-5">
      <Link to="/erp/obras" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />Obras</Link>
      <PageHeader
        title={obra.nombre}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Mono>{obra.id}</Mono><ObraStatusBadge estado={obra.estado} />{obra.es_emergencia_sin_presupuesto && <EmergencyBadge />}</span>}
        actions={obra.estado === 'PLANIFICADA' && can(rol, 'obras.crear') && <Button icon={Play} onClick={() => setIniciando(true)}>Iniciar obra</Button>}
      />

      {obra.es_emergencia_sin_presupuesto && obra.estado !== 'FINALIZADA' && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-bg p-4 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><b>Obra abierta por CU30 sin presupuesto.</b> Debe regularizarse con un presupuesto aprobado antes de poder finalizar. Mientras tanto se registran materiales y horas.</p>
        </div>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'resumen' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card title="Datos de la obra">
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Dato label="Cliente">{cliente.data?.razon_social ?? obra.cliente_id}</Dato>
              <Dato label="Tipo">{TIPO_OBRA_LABEL[obra.tipo]}</Dato>
              <Dato label="Presupuesto">{obra.presupuesto_id ? <Link className="font-mono text-brand" to={`/erp/presupuestos/${obra.presupuesto_id}`}>{obra.presupuesto_id}</Link> : <span className="text-warn">Sin presupuesto (CU30)</span>}</Dato>
              <Dato label="Supervisor">{supervisor}</Dato>
              <Dato label="Ubicación"><span className="flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />{obra.ubicacion.direccion}, {obra.ubicacion.comuna}</span></Dato>
              <Dato label="Geocerca"><Mono>{obra.ubicacion.radio_m} m · {obra.ubicacion.lat.toFixed(4)}, {obra.ubicacion.lng.toFixed(4)}</Mono></Dato>
              <Dato label="Plazo"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-ink-faint" /><Mono>{formatFecha(obra.fecha_inicio)} → {formatFecha(obra.fecha_cierre ?? obra.fecha_fin_estimada)}</Mono></span></Dato>
              {obra.costo_real && <Dato label="Costo real a la fecha"><MoneyCell value={obra.costo_real.total} className="font-semibold" /></Dato>}
              <Dato label={`Técnicos asignados (${obra.tecnicos_detalle.length})`} full>
                <ul className="flex flex-wrap gap-2">
                  {obra.tecnicos_detalle.map((t) => <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs"><Users className="h-3 w-3 text-ink-faint" />{t.nombre}<span className="text-ink-faint">· {t.cargo}</span></li>)}
                  {obra.tecnicos_detalle.length === 0 && <li className="text-ink-faint">Sin técnicos asignados: nadie la verá en la app de terreno.</li>}
                </ul>
                {puedeAsignar && <Button variant="secondary" size="sm" icon={UserPlus} className="mt-3" onClick={() => setAsignando(obra.tecnicos)}>Asignar técnicos</Button>}
              </Dato>
            </dl>
          </Card>
          <PanelCierre obra={obra} onChanged={obraRes.reload} />
        </div>
      )}
      {tab === 'costos' && obra.costo_real && <CostosTab obra={obra} />}
      {tab === 'materiales' && <MaterialesTab obra={obra} />}
      {tab === 'hojas' && <HojasTab obra={obra} />}
      {tab === 'auditoria' && <AuditoriaTab obra={obra} />}

      <Modal open={Boolean(asignando)} onClose={() => setAsignando(null)} title="Asignar técnicos"
        footer={<><Button variant="secondary" onClick={() => setAsignando(null)}>Cancelar</Button><Button loading={trabajando} onClick={guardarAsignacion}>Guardar asignación</Button></>}>
        {asignando && <SelectorTecnicos tecnicos={tecnicos.data ?? undefined} value={asignando} onChange={setAsignando} compacto />}
      </Modal>
      <ConfirmDialog open={iniciando} onClose={() => setIniciando(false)} onConfirm={iniciar} loading={trabajando} confirmLabel="Iniciar obra"
        title="Iniciar obra" message="La obra pasará a «En curso»: los técnicos asignados podrán registrar hojas de servicio y solicitar materiales." />
    </div>
  )
}

function Dato({ label, children, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="mb-0.5 text-xs text-ink-soft">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
