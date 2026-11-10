import { useEffect, useState } from 'react'
import { FileText, FilePlus2, Download, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, Card, DataTable, Modal, Input, Select, Badge, Mono, Tabs } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { formatFecha, fechaLocal } from '@/domain/format'
import { CAUSALES, TIPOS_CONTRATO, TIPOS_DOCUMENTO, causalIndemniza, estadoContractual, pesos, validarArchivo, ESTADO_PAGO } from '@/domain/rrhh'
import { rrhhService } from '@/services'
import { FichasTab } from './FichasTab'

const errorDe = (err) => (err.data && typeof err.data === 'object' ? Object.fromEntries(Object.entries(err.data).map(([k, v]) => [k, [].concat(v)[0]])) : { _: err.message })

function Fila({ etiqueta, valor, fuerte }) {
  return <div className={`flex justify-between gap-4 py-1.5 text-sm ${fuerte ? 'border-t border-line-strong/60 pt-2.5 font-semibold' : ''}`}><span className="text-ink-soft">{etiqueta}</span><Mono>{valor}</Mono></div>
}

/** Genera el finiquito: los montos que se muestran los calcula el servidor (vista previa) y se vuelven a calcular al guardar. */
function FiniquitoModal({ persona, onClose, onSaved }) {
  const c = persona.contrato
  const [f, setF] = useState({ causal_despido: 'NECESIDADES_EMPRESA', fecha_termino: fechaLocal(), dias_vacaciones_pendientes: '0', aviso_previo_dado: true })
  const [vista, setVista] = useState(null)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value })
  const datos = { contrato: c.id, ...f, dias_vacaciones_pendientes: f.dias_vacaciones_pendientes || '0' }

  useEffect(() => {
    let vivo = true
    setErrores({})
    const t = setTimeout(() => {
      rrhhService.calcularFiniquito(datos)
        .then((r) => vivo && setVista(r))
        .catch((err) => { if (vivo) { setVista(null); setErrores(errorDe(err)) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f])

  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    try {
      await rrhhService.crearFiniquito(datos)
      toast.success(`Finiquito generado para ${persona.nombre}. Queda pendiente de pago en Finanzas.`)
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Generar finiquito · ${persona.nombre}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-finiquito" loading={guardando} disabled={!vista}>Generar finiquito</Button></>}>
      <form id="form-finiquito" onSubmit={guardar} className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Select label="Causal de término" value={f.causal_despido} onChange={set('causal_despido')} options={CAUSALES} error={errores.causal_despido} />
          <Input label="Fecha de término" type="date" required value={f.fecha_termino} onChange={set('fecha_termino')} error={errores.fecha_termino} />
          <Input label="Días de vacaciones pendientes" type="number" min="0" step="0.5" value={f.dias_vacaciones_pendientes} onChange={set('dias_vacaciones_pendientes')} error={errores.dias_vacaciones_pendientes} />
          {causalIndemniza(f.causal_despido) && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.aviso_previo_dado} onChange={set('aviso_previo_dado')} />
              <span>Se avisó con 30 días de anticipación<span className="block text-xs text-ink-soft">Si no, se suma la indemnización sustitutiva del aviso previo.</span></span></label>
          )}
          {(errores._ || errores.contrato) && <p role="alert" className="text-sm font-medium text-crit">{errores._ ?? errores.contrato}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4" />Cálculo del servidor</p>
          <Fila etiqueta="Sueldo base" valor={pesos(c.sueldo_base)} />
          {vista ? (<>
            <Fila etiqueta={`Años de servicio (${vista.anios_servicio})`} valor={pesos(vista.indemnizacion_anios)} />
            <Fila etiqueta="Indemnización sustitutiva del aviso" valor={pesos(vista.indemnizacion_aviso)} />
            <Fila etiqueta="Vacaciones proporcionales" valor={pesos(vista.vacaciones)} />
            <Fila etiqueta="Total a pagar" valor={pesos(vista.monto_total)} fuerte />
          </>) : <p className="py-3 text-sm text-ink-soft">Completa los datos para calcular.</p>}
          <p className="mt-3 text-xs text-ink-soft">Solo la causal del art. 161 paga indemnización por años de servicio (tope 11 años). No incluye remuneración del mes ni descuentos previsionales.</p>
        </div>
      </form>
    </Modal>
  )
}

function ContratoModal({ persona, onClose, onSaved }) {
  const [f, setF] = useState({ fecha_inicio: fechaLocal(), fecha_termino: '', sueldo_base: '' })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      await rrhhService.crearContrato({ empleado: persona.id, ...f, fecha_termino: f.fecha_termino || null })
      toast.success(`Contrato creado para ${persona.nombre}.`)
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Nuevo contrato · ${persona.nombre}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-contrato" loading={guardando}>Crear contrato</Button></>}>
      <form id="form-contrato" onSubmit={guardar} className="space-y-4">
        {/* El tipo de contrato no se elige aquí: sale de la ficha del trabajador (única fuente de verdad). */}
        <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm"><span className="text-ink-soft">Tipo de contrato (según su ficha): </span><span className="font-medium">{TIPOS_CONTRATO.find((t) => t.value === persona.tipo_contrato)?.label ?? '—'}</span></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Fecha de inicio" type="date" required value={f.fecha_inicio} onChange={set('fecha_inicio')} error={errores.fecha_inicio} />
          <Input label="Fecha de término" type="date" required={persona.tipo_contrato === 'PLAZO_FIJO'} value={f.fecha_termino} onChange={set('fecha_termino')} error={errores.fecha_termino} />
        </div>
        <Input label="Sueldo base mensual (CLP)" type="number" min="1" required value={f.sueldo_base} onChange={set('sueldo_base')} error={errores.sueldo_base} />
        {(errores._ || errores.empleado) && <p role="alert" className="text-sm font-medium text-crit">{errores._ ?? errores.empleado}</p>}
      </form>
    </Modal>
  )
}

function DocumentoModal({ personal, onClose, onSaved }) {
  const [f, setF] = useState({ empleado: personal[0]?.id ?? '', tipo_documento: 'AMONESTACION', fecha_emision: fechaLocal() })
  const [archivo, setArchivo] = useState(null)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    const e = validarArchivo(archivo, ['pdf'])
    if (e) return setErrores({ archivo_pdf: e })
    setGuardando(true)
    setErrores({})
    try {
      await rrhhService.subirDocumento({ ...f, archivo_pdf: archivo })
      toast.success('Documento guardado.')
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title="Subir documento"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-documento" loading={guardando}>Subir PDF</Button></>}>
      <form id="form-documento" onSubmit={guardar} className="space-y-4">
        <Select label="Empleado" value={f.empleado} onChange={set('empleado')} options={personal.map((p) => ({ value: p.id, label: p.nombre }))} error={errores.empleado} />
        <Select label="Tipo de documento" value={f.tipo_documento} onChange={set('tipo_documento')} options={TIPOS_DOCUMENTO} error={errores.tipo_documento} />
        <Input label="Fecha de emisión" type="date" required max={fechaLocal()} value={f.fecha_emision} onChange={set('fecha_emision')} error={errores.fecha_emision} />
        <Input label="Archivo PDF (máx. 10 MB)" type="file" accept=".pdf,application/pdf" required onChange={(ev) => setArchivo(ev.target.files?.[0] ?? null)} error={errores.archivo_pdf} />
        {errores._ && <p role="alert" className="text-sm font-medium text-crit">{errores._}</p>}
      </form>
    </Modal>
  )
}

/** Gestión de personal: contratos, documentos y finiquitos. Solo RRHH (gestiona) y Admin (supervisa, solo lectura). */
export function ModuloRRHH() {
  const rol = useAuthStore((s) => s.user?.rol)
  const gestiona = can(rol, 'rrhh.gestionar')
  // La ficha la completan RR. HH. y el Administrador: los mismos dos roles que pueden entrar a este módulo (rrhh.ver). El servidor lo exige igual.
  const verFichas = can(rol, 'rrhh.ver')
  const [tab, setTab] = useState('personal')
  const [modal, setModal] = useState(null) // { tipo: 'contrato'|'finiquito'|'documento', persona? }
  const personal = useResource(() => rrhhService.personal(), [])
  const documentos = useResource(() => rrhhService.documentos(), [])
  const finiquitos = useResource(() => rrhhService.finiquitos(), [])
  const recargar = () => { personal.reload(); documentos.reload(); finiquitos.reload() }
  const nombre = (id) => personal.data?.find((p) => p.id === id)?.nombre ?? '—'

  const colPersonal = [
    { key: 'nombre', header: 'Persona', render: (p) => <div><p className="font-medium">{p.nombre}</p><p className="text-xs text-ink-soft">{p.email}</p></div> },
    { key: 'cargo', header: 'Contrato', render: (p) => p.contrato ? <span>{TIPOS_CONTRATO.find((t) => t.value === p.contrato.tipo_contrato)?.label} · desde {formatFecha(p.contrato.fecha_inicio)}</span> : '—' },
    { key: 'sueldo', header: 'Sueldo base', align: 'right', render: (p) => p.contrato ? <Mono>{pesos(p.contrato.sueldo_base)}</Mono> : '—' },
    { key: 'estado', header: 'Estado contractual', render: (p) => { const e = estadoContractual(p.contrato); return <Badge tone={e.tone}>{e.label}</Badge> } },
    ...(gestiona ? [{ key: 'acc', header: '', align: 'right', render: (p) => (
      <div className="flex justify-end gap-2" onClick={(ev) => ev.stopPropagation()}>
        {(!p.contrato || p.contrato.estado === 'FINIQUITADO') && (p.ficha_id
          ? <Button size="sm" variant="secondary" icon={FilePlus2} onClick={() => setModal({ tipo: 'contrato', persona: p })}>Nuevo contrato</Button>
          : <Button size="sm" variant="ghost" onClick={() => setTab('fichas')} title="Antes de crear el contrato hay que completar la ficha">Completar ficha</Button>)}
        {p.contrato?.estado === 'ACTIVO' && !p.contrato.finiquito_id && <Button size="sm" variant="secondary" onClick={() => setModal({ tipo: 'finiquito', persona: p })}>Generar finiquito</Button>}
      </div>) }] : []),
  ]
  const colDocs = [
    { key: 'emp', header: 'Empleado', render: (d) => d.empleado_nombre },
    { key: 'tipo', header: 'Tipo', render: (d) => TIPOS_DOCUMENTO.find((t) => t.value === d.tipo_documento)?.label },
    { key: 'fecha', header: 'Emisión', render: (d) => <Mono>{formatFecha(d.fecha_emision)}</Mono> },
    { key: 'dl', header: '', align: 'right', render: (d) => <Button size="sm" variant="ghost" icon={Download} onClick={() => rrhhService.descargarDocumento(d.id).catch((e) => toast.error(e.message))}>Descargar</Button> },
  ]
  const colFin = [
    { key: 'emp', header: 'Empleado', render: (f) => f.empleado_nombre ?? nombre(f.contrato) },
    { key: 'causal', header: 'Causal', render: (f) => f.causal_texto },
    { key: 'total', header: 'Total', align: 'right', render: (f) => <Mono>{pesos(f.monto_total)}</Mono> },
    { key: 'estado', header: 'Pago', render: (f) => <Badge tone={ESTADO_PAGO[f.estado_pago].tone}>{ESTADO_PAGO[f.estado_pago].label}</Badge> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Contratos y Finiquitos" description={gestiona ? 'Contratos, documentos laborales y finiquitos. El pago lo registra Finanzas.' : 'Supervisión de contratos, documentos y finiquitos (solo lectura).'}
        actions={gestiona && tab === 'documentos' ? <Button icon={FileText} onClick={() => setModal({ tipo: 'documento' })} disabled={!personal.data?.length}>Subir documento</Button> : null} />
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'personal', label: 'Personal', count: personal.data?.length }, ...(verFichas ? [{ id: 'fichas', label: 'Fichas', count: personal.data?.filter((p) => !p.ficha_id).length || undefined }] : []), { id: 'documentos', label: 'Documentos', count: documentos.data?.length }, { id: 'finiquitos', label: 'Finiquitos', count: finiquitos.data?.length }]} />
        <div className="pt-2">
          {tab === 'personal' && (personal.error ? <ErrorEstado error={personal.error} onRetry={personal.reload} /> : <DataTable columns={colPersonal} rows={personal.data ?? []} loading={personal.loading && !personal.data} rowKey={(p) => p.id} emptyTitle="Sin personal" />)}
          {tab === 'fichas' && verFichas && <FichasTab personal={personal.data ?? []} onCambio={personal.reload} />}
          {tab === 'documentos' && (documentos.error ? <ErrorEstado error={documentos.error} onRetry={documentos.reload} /> : <DataTable columns={colDocs} rows={documentos.data ?? []} loading={documentos.loading && !documentos.data} rowKey={(d) => d.id} emptyTitle="Sin documentos" emptyHint="Aquí quedan las amonestaciones, anexos y cartas." />)}
          {tab === 'finiquitos' && (finiquitos.error ? <ErrorEstado error={finiquitos.error} onRetry={finiquitos.reload} /> : <DataTable columns={colFin} rows={finiquitos.data ?? []} loading={finiquitos.loading && !finiquitos.data} rowKey={(f) => f.id} emptyTitle="Sin finiquitos" />)}
        </div>
      </Card>
      {modal?.tipo === 'contrato' && <ContratoModal persona={modal.persona} onClose={() => setModal(null)} onSaved={recargar} />}
      {modal?.tipo === 'finiquito' && <FiniquitoModal persona={modal.persona} onClose={() => setModal(null)} onSaved={recargar} />}
      {modal?.tipo === 'documento' && <DocumentoModal personal={personal.data ?? []} onClose={() => setModal(null)} onSaved={recargar} />}
    </div>
  )
}
