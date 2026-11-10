import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal, Input, Select, Textarea, Tabs, DataTable, Badge, Mono, NumberField } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { flotaService } from '@/services'
import { formatFecha, formatFechaHora, fechaLocal } from '@/domain/format'
import { formatKm } from '@/domain/flota'
import { TIPOS_DOCUMENTO_VEHICULO, validarVehiculo, cuerpoVehiculo, validarDocumentoVehiculo } from '@/domain/flotaGestion'

const errorDe = (err) => (err.data && typeof err.data === 'object' ? Object.fromEntries(Object.entries(err.data).map(([k, v]) => [k, [].concat(v)[0]])) : { _: err.message })

/** Crear o editar un vehículo. El kilometraje y los vencimientos NO se escriben aquí: tienen su propio registro con historial. */
export function VehiculoModal({ vehiculo, tecnicos, onClose, onSaved }) {
  const [f, setF] = useState(vehiculo
    ? { patente: vehiculo.patente, marca: vehiculo.marca, modelo: vehiculo.modelo, anio: vehiculo.anio ?? '', tecnico: vehiculo.tecnico ?? '', estado: vehiculo.estado, activo: vehiculo.activo }
    : { patente: '', marca: '', modelo: '', anio: '', tecnico: '', km_inicial: '', estado: 'ACTIVO', activo: true })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    const locales = validarVehiculo(f)
    setErrores(locales)
    if (Object.keys(locales).length) return
    setGuardando(true)
    try {
      const cuerpo = cuerpoVehiculo(f, Boolean(vehiculo))
      if (vehiculo) await flotaService.actualizar(vehiculo.id, cuerpo)
      else await flotaService.crear(cuerpo)
      toast.success(vehiculo ? 'Vehículo actualizado.' : 'Vehículo creado.')
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={vehiculo ? `Editar ${vehiculo.patente}` : 'Nuevo vehículo'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-vehiculo" loading={guardando}>Guardar</Button></>}>
      <form id="form-vehiculo" onSubmit={guardar} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Patente" placeholder="ABCD-12" required mono value={f.patente} onChange={set('patente')} error={errores.patente} />
          <Input label="Año" type="number" value={f.anio} onChange={set('anio')} error={errores.anio} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Marca" required value={f.marca} onChange={set('marca')} error={errores.marca} />
          <Input label="Modelo" required value={f.modelo} onChange={set('modelo')} error={errores.modelo} />
        </div>
        <Select label="Técnico asignado" value={f.tecnico} onChange={set('tecnico')} options={tecnicos} placeholder="Sin asignar" error={errores.tecnico} />
        {!vehiculo && <Input label="Kilometraje actual (odómetro)" type="number" min="0" value={f.km_inicial} onChange={set('km_inicial')} error={errores.km_inicial} hint="Queda como lectura inicial. Después solo avanza." />}
        {vehiculo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Estado" value={f.estado} onChange={set('estado')} options={[{ value: 'ACTIVO', label: 'Activo' }, { value: 'EN_TALLER', label: 'En taller' }]} />
            <label className="flex items-end gap-2 pb-2 text-sm text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.activo} onChange={(ev) => setF({ ...f, activo: ev.target.checked })} />Vehículo en uso (activo)</label>
          </div>
        )}
        {(errores._ || errores.detail) && <p role="alert" className="text-sm font-medium text-crit">{errores._ ?? errores.detail}</p>}
      </form>
    </Modal>
  )
}

/** Registra una revisión técnica, un permiso o un seguro: el día en que se hizo y el día en que vence. Cada renovación queda en el historial. */
export function DocumentoModal({ vehiculo, onClose, onSaved }) {
  const [f, setF] = useState({ tipo: 'REVISION_TECNICA', fecha_realizacion: fechaLocal(), fecha_vencimiento: '', referencia: '', observacion: '' })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    const locales = validarDocumentoVehiculo(f, fechaLocal())
    setErrores(locales)
    if (Object.keys(locales).length) return
    setGuardando(true)
    try {
      await flotaService.registrarDocumento(vehiculo.id, { ...f, fecha_realizacion: f.fecha_realizacion || null })
      toast.success('Registro guardado.')
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Registrar revisión o documento · ${vehiculo.patente}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-doc-vehiculo" loading={guardando}>Guardar</Button></>}>
      <form id="form-doc-vehiculo" onSubmit={guardar} className="space-y-4" noValidate>
        <Select label="Qué se renovó" value={f.tipo} onChange={set('tipo')} options={TIPOS_DOCUMENTO_VEHICULO} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Día en que se hizo" type="date" value={f.fecha_realizacion} onChange={set('fecha_realizacion')} error={errores.fecha_realizacion} max={fechaLocal()} />
          <Input label="Vence el" type="date" required value={f.fecha_vencimiento} onChange={set('fecha_vencimiento')} error={errores.fecha_vencimiento} />
        </div>
        <Input label="N.º de certificado, póliza o aseguradora" value={f.referencia} onChange={set('referencia')} error={errores.referencia} maxLength={80} />
        <Textarea label="Observación" value={f.observacion} onChange={set('observacion')} maxLength={300} rows={2} />
        <p className="rounded-lg bg-brand-tint p-3 text-xs text-ink-soft">Esto no reemplaza el registro anterior: se suma al historial, y el vencimiento vigente pasa a ser el más lejano.</p>
        {(errores._ || errores.detail) && <p role="alert" className="text-sm font-medium text-crit">{errores._ ?? errores.detail}</p>}
      </form>
    </Modal>
  )
}

/** Corrige o actualiza el odómetro a mano (RR. HH.). Solo puede avanzar; la hoja de servicio del técnico también lo actualiza sola. */
export function KmModal({ vehiculo, onClose, onSaved }) {
  const [km, setKm] = useState(vehiculo.km_actual)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await flotaService.registrarLectura(vehiculo.id, Math.round(km))
      toast.success('Kilometraje actualizado.')
      onSaved()
      onClose()
    } catch (err) { setError(errorDe(err).km ?? err.message) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Kilometraje · ${vehiculo.patente}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={guardando} disabled={!(km > vehiculo.km_actual)} onClick={guardar}>Guardar lectura</Button></>}>
      <div className="space-y-3">
        <NumberField label="Lectura del odómetro (km)" min={0} value={km} onChange={setKm} hint={`Último registro: ${formatKm(vehiculo.km_actual)}`} error={error} />
        <p className="rounded-lg bg-brand-tint p-3 text-xs text-ink-soft">El odómetro solo avanza. Cada lectura queda con quién la registró y cuándo.</p>
      </div>
    </Modal>
  )
}

/** Historial de documentos (revisión, permiso, seguro) y de lecturas del odómetro. */
export function HistorialModal({ vehiculo, onClose }) {
  const [tab, setTab] = useState('documentos')
  const docs = useResource(() => flotaService.documentos(vehiculo.id), [vehiculo.id])
  const lecturas = useResource(() => flotaService.lecturas(vehiculo.id), [vehiculo.id])
  const colsDocs = [
    { key: 'tipo', header: 'Documento', render: (d) => d.tipo_texto },
    { key: 'hecho', header: 'Se hizo', render: (d) => (d.fecha_realizacion ? <Mono>{formatFecha(d.fecha_realizacion)}</Mono> : <span className="text-ink-faint">Sin dato</span>) },
    { key: 'vence', header: 'Vence', render: (d) => <Mono>{formatFecha(d.fecha_vencimiento)}</Mono> },
    { key: 'ref', header: 'Referencia', render: (d) => d.referencia || '—' },
    { key: 'por', header: 'Registró', render: (d) => <span className="text-xs text-ink-soft">{d.registrado_por_nombre}</span> },
  ]
  const colsKm = [
    { key: 'km', header: 'Kilómetros', align: 'right', render: (l) => <Mono>{formatKm(l.km)}</Mono> },
    { key: 'origen', header: 'Origen', render: (l) => <Badge tone={l.origen === 'HOJA_SERVICIO' ? 'info' : 'neutral'}>{l.origen_texto}</Badge> },
    { key: 'fecha', header: 'Fecha', render: (l) => <Mono className="text-xs">{formatFechaHora(l.fecha)}</Mono> },
    { key: 'por', header: 'Registró', render: (l) => <span className="text-xs text-ink-soft">{l.registrado_por_nombre}</span> },
  ]
  const cont = (r, cols, vacio) => (r.error ? <ErrorEstado error={r.error} onRetry={r.reload} /> : <DataTable columns={cols} rows={r.data ?? []} loading={r.loading && !r.data} rowKey={(x) => x.id} emptyTitle={vacio} />)
  return (
    <Modal open onClose={onClose} title={`Historial · ${vehiculo.patente}`} size="lg" footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'documentos', label: 'Revisiones y documentos', count: docs.data?.length }, { id: 'km', label: 'Kilometraje', count: lecturas.data?.length }]} />
      <div className="pt-2">{tab === 'documentos' ? cont(docs, colsDocs, 'Sin documentos registrados') : cont(lecturas, colsKm, 'Sin lecturas')}</div>
    </Modal>
  )
}
