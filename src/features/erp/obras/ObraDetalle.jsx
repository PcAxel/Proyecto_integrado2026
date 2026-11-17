import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Play, Receipt, AlertTriangle, MapPin, CalendarDays, Users, UserPlus, Send, ClipboardCheck, ShieldCheck, XCircle, Hourglass } from 'lucide-react'
import { PageHeader, Tabs, Card, Button, Skeleton, Mono, ConfirmDialog, Modal, Textarea } from '@/components/ui'
import { ObraStatusBadge, EtapaObraBadge, EmergencyBadge, TIPO_OBRA_LABEL, MoneyCell } from '@/components/domain'
import { obrasService, clientesService } from '@/services'
import { formatFecha } from '@/domain/format'
import { puedeDelegar, puedeAuditar, puedeOperarObra } from '@/domain/etapasObra'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { PanelCierre } from './PanelCierre'
import { FacturacionPanel } from '../facturacion/FacturacionPanel'
import { CostosTab, MaterialesTab, HojasTab, AuditoriaTab } from './ObraTabs'
import { SelectorTecnicos } from './SelectorTecnicos'

export function ObraDetalle() {
  const { id } = useParams()
  const rol = useAuthStore((s) => s.user.rol)
  const [tab, setTab] = useState('resumen')
  const [params, setParams] = useSearchParams()
  const [resaltarFactura, setResaltarFactura] = useState(false)
  const irAFactura = useRef(false)
  const [iniciando, setIniciando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [asignando, setAsignando] = useState(null) // ids elegidos mientras el modal está abierto
  const [delegando, setDelegando] = useState(null) // ídem para «Delegar a terreno»
  const [auditando, setAuditando] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const [rechazo, setRechazo] = useState(null) // motivo mientras el modal de rechazo está abierto
  const obraRes = useResource(() => obrasService.retrieve(id), [id])
  const cliente = useResource(() => clientesService.retrieve(obraRes.data?.cliente_id ?? 'CLI-001').catch(() => null), [obraRes.data?.cliente_id])
  const obra = obraRes.data
  const puedeAsignar = Boolean(obra) && can(rol, 'obras.crear') && obra.estado !== 'FINALIZADA'
  const puedeFlujo = Boolean(obra) && can(rol, 'obras.delegar') // Jefe de Operaciones: delega a terreno y da la auditoría
  const pendiente = obra?.aprobacion_finanzas === 'PENDIENTE' // Finanzas aún no la aprueba
  const rechazada = obra?.aprobacion_finanzas === 'RECHAZADA'
  const habilitada = obra ? puedeOperarObra(obra) : false
  const tecnicos = useResource(() => (puedeAsignar || puedeFlujo ? obrasService.tecnicosDisponibles() : Promise.resolve(null)), [puedeAsignar, puedeFlujo])

  // `?facturar=1` (lo pone el asistente de IA): baja hasta la tarjeta de facturación y la resalta unos segundos. NO emite nada: la persona revisa y pulsa.
  useEffect(() => {
    if (params.get('facturar') === '1') { irAFactura.current = true; setParams({}, { replace: true }) }
  }, [params, setParams])
  useEffect(() => {
    if (!irAFactura.current || !obra) return
    irAFactura.current = false
    setTab('resumen')
    setResaltarFactura(true)
    setTimeout(() => document.getElementById('facturacion')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    setTimeout(() => setResaltarFactura(false), 6000)
  }, [obra, params])

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

  const delegar = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.delegarATerreno(obra.id, delegando), 'Obra delegada a terreno: los técnicos ya la ven en su app')
    setTrabajando(false)
    if (r) { setDelegando(null); obraRes.reload() }
  }

  const aprobar = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.aprobarObra(obra.id), 'Obra aprobada: Operaciones ya puede delegarla a terreno')
    setTrabajando(false)
    if (r) { setAprobando(false); obraRes.reload() }
  }
  const rechazar = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.rechazarObra(obra.id, rechazo), 'Obra rechazada: se le avisó a quien la creó')
    setTrabajando(false)
    if (r) { setRechazo(null); obraRes.reload() }
  }

  const auditar = async () => {
    setTrabajando(true)
    const r = await runAction(obrasService.auditoriaTerrenoOk(obra.id), 'Auditoría de terreno OK: se avisó a Finanzas que la obra está lista para facturar')
    setTrabajando(false)
    if (r) { setAuditando(false); obraRes.reload() }
  }

  return (
    <div className="space-y-5">
      <Link to="/erp/obras" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />Obras</Link>
      <PageHeader
        title={obra.nombre}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Mono>{obra.id}</Mono><ObraStatusBadge estado={obra.estado} /><EtapaObraBadge etapa={obra.etapa} />{obra.es_emergencia_sin_presupuesto && <EmergencyBadge />}</span>}
        actions={(
          <>
            {pendiente && can(rol, 'obras.aprobar') && (
              <>
                <Button variant="success" icon={ShieldCheck} onClick={() => setAprobando(true)}>Aprobar obra</Button>
                <Button variant="secondary" icon={XCircle} onClick={() => setRechazo('')}>Rechazar</Button>
              </>
            )}
            {puedeFlujo && puedeDelegar(obra) && <Button icon={Send} disabled={!habilitada} title={habilitada ? undefined : 'Espera la aprobación de Finanzas'} onClick={() => setDelegando(obra.tecnicos)}>Delegar a Terreno</Button>}
            {puedeFlujo && puedeAuditar(obra) && <Button variant="success" icon={ClipboardCheck} onClick={() => setAuditando(true)}>Auditoría Terreno OK</Button>}
            {obra.estado === 'PLANIFICADA' && can(rol, 'obras.crear') && !puedeFlujo && <Button icon={Play} disabled={!habilitada} onClick={() => setIniciando(true)}>Iniciar obra</Button>}
            {obra.estado === 'FINALIZADA' && can(rol, 'facturacion.emitir') && (
              // Atajo a la tarjeta de facturación electrónica (está en el Resumen, abajo a la derecha): cambia a ese tab y baja hasta ella.
              <Button variant="secondary" icon={Receipt} onClick={() => { setTab('resumen'); setTimeout(() => document.getElementById('facturacion')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60) }}>Facturar</Button>
            )}
          </>
        )}
      />

      {pendiente && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-bg p-4 text-sm text-warn">
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
          <p><b>Esperando la aprobación de Finanzas.</b> {can(rol, 'obras.aprobar') ? 'Revisa los datos y aprueba o rechaza la obra: hasta entonces Operaciones no puede delegarla a terreno.' : 'Hasta que la apruebe no se puede iniciar ni delegar a terreno. Finanzas ya recibió el aviso.'}</p>
        </div>
      )}
      {rechazada && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-crit/40 bg-crit-bg p-4 text-sm text-crit">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><b>Finanzas rechazó esta obra.</b> Motivo: {obra.motivo_rechazo_finanzas || 'sin detalle'}. No puede iniciarse ni delegarse a terreno.</p>
        </div>
      )}
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
          <div className="space-y-5">
            <PanelCierre obra={obra} onChanged={obraRes.reload} />
            {obra.estado === 'FINALIZADA' && <FacturacionPanel obraId={obra.id} resaltar={resaltarFactura} />}
          </div>
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
      <Modal open={Boolean(delegando)} onClose={() => setDelegando(null)} title="Delegar a terreno"
        footer={<><Button variant="secondary" onClick={() => setDelegando(null)}>Cancelar</Button><Button icon={Send} loading={trabajando} disabled={!delegando?.length} onClick={delegar}>Delegar</Button></>}>
        {delegando && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Elige quién trabajará en <b>{obra.nombre}</b>. La obra quedará «En curso» y solo los técnicos elegidos la verán en su app de terreno.</p>
            <SelectorTecnicos tecnicos={tecnicos.data ?? undefined} value={delegando} onChange={setDelegando} compacto />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={aprobando} onClose={() => setAprobando(false)} onConfirm={aprobar} loading={trabajando} confirmLabel="Aprobar obra"
        title="Aprobar obra" message="Operaciones podrá delegar esta obra a terreno (asignar técnicos) y comenzar el trabajo. Se le avisará a quien la creó." />
      <Modal open={rechazo !== null} onClose={() => setRechazo(null)} title="Rechazar obra"
        footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button><Button variant="danger" loading={trabajando} disabled={!rechazo?.trim()} onClick={rechazar}>Rechazar</Button></>}>
        <Textarea label="Motivo (le llegará a Operaciones)" value={rechazo ?? ''} onChange={(e) => setRechazo(e.target.value)} />
      </Modal>
      <ConfirmDialog open={auditando} onClose={() => setAuditando(false)} onConfirm={auditar} loading={trabajando} confirmLabel="Auditoría OK"
        title="Auditoría Terreno OK" message="Confirmas que el trabajo de terreno está conforme. La obra pasará a «Finalizada» (si cumple los 6 requisitos de cierre) y se avisará a Finanzas que está lista para facturar." />
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
