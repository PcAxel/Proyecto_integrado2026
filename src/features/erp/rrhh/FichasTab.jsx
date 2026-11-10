import { useState } from 'react'
import { IdCard, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button, DataTable, Modal, Input, Select, Badge, Mono } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { formatFecha, fechaLocal } from '@/domain/format'
import { normalizarRut } from '@/domain/rut'
import { validarFicha, cuerpoFicha } from '@/domain/rrhh'
import { rrhhService } from '@/services'

const errorDe = (err) => (err.data && typeof err.data === 'object' ? Object.fromEntries(Object.entries(err.data).map(([k, v]) => [k, [].concat(v)[0]])) : { _: err.message })
const etiqueta = (lista, valor) => lista?.find((o) => o.value === valor)?.label ?? valor

const VACIA = { rut: '', afp: '', sistema_salud: '', isapre: '', tipo_contrato: '', fecha_ingreso: fechaLocal() }

/**
 * Crea o edita la ficha de una persona. Las listas (AFP, salud, isapre, contrato) las entrega el servidor (`/rrhh/fichas/opciones/`).
 * El servidor valida de nuevo el RUT (módulo 11), que no se repita y la coherencia Fonasa/Isapre.
 */
function FichaModal({ persona, ficha, opciones, onClose, onSaved }) {
  const [f, setF] = useState(ficha ? { rut: ficha.rut, afp: ficha.afp, sistema_salud: ficha.sistema_salud, isapre: ficha.isapre, tipo_contrato: ficha.tipo_contrato, fecha_ingreso: ficha.fecha_ingreso } : VACIA)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    const locales = validarFicha(f)
    setErrores(locales)
    if (Object.keys(locales).length) return
    setGuardando(true)
    try {
      const cuerpo = cuerpoFicha(f)
      if (ficha) await rrhhService.actualizarFicha(ficha.id, cuerpo)
      else await rrhhService.crearFicha({ usuario: persona.id, ...cuerpo })
      toast.success(`Ficha de ${persona.nombre} guardada.`)
      onSaved()
      onClose()
    } catch (err) { setErrores(errorDe(err)) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title={`${ficha ? 'Editar ficha' : 'Completar ficha'} · ${persona.nombre}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-ficha" loading={guardando}>Guardar ficha</Button></>}>
      <form id="form-ficha" onSubmit={guardar} className="space-y-4" noValidate>
        <Input label="RUT" placeholder="12.345.678-5" required mono value={f.rut} onChange={set('rut')} onBlur={() => f.rut && setF({ ...f, rut: normalizarRut(f.rut) })}
          error={errores.rut} hint="Se comprueba el dígito verificador." autoComplete="off" />
        <Select label="Previsión (AFP)" required value={f.afp} onChange={set('afp')} options={opciones.afp} placeholder="Elige la AFP" error={errores.afp} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Sistema de salud" required value={f.sistema_salud} onChange={(ev) => setF({ ...f, sistema_salud: ev.target.value, isapre: ev.target.value === 'ISAPRE' ? f.isapre : '' })}
            options={opciones.sistema_salud} placeholder="Elige" error={errores.sistema_salud} />
          {f.sistema_salud === 'ISAPRE' && <Select label="Isapre" required value={f.isapre} onChange={set('isapre')} options={opciones.isapre} placeholder="Elige la isapre" error={errores.isapre} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo de contrato" required value={f.tipo_contrato} onChange={set('tipo_contrato')} options={opciones.tipo_contrato} placeholder="Elige" error={errores.tipo_contrato} />
          <Input label="Fecha de ingreso" type="date" required value={f.fecha_ingreso} onChange={set('fecha_ingreso')} error={errores.fecha_ingreso} />
        </div>
        {(errores._ || errores.usuario) && <p role="alert" className="text-sm font-medium text-crit">{errores._ ?? errores.usuario}</p>}
      </form>
    </Modal>
  )
}

/**
 * Fichas laborales y previsionales. El Administrador crea la cuenta de acceso; aquí RR. HH. (o el Administrador) completa y corrige
 * la ficha de cada persona. Es la única fuente de verdad del RUT, la previsión, la salud y el tipo de contrato.
 * @param {{personal: Array<any>, onCambio: () => void}} props `personal`: tabla de /rrhh/personal/ (cuentas activas, con `ficha_id`)
 */
export function FichasTab({ personal, onCambio }) {
  const fichas = useResource(() => rrhhService.fichas(), [])
  const opciones = useResource(() => rrhhService.opcionesFicha(), [])
  const [modal, setModal] = useState(null) // { persona, ficha? }
  const porUsuario = new Map((fichas.data ?? []).map((x) => [x.usuario, x]))
  const sinFicha = personal.filter((p) => !porUsuario.has(p.id)).length

  const columnas = [
    { key: 'persona', header: 'Persona', render: (p) => <div><p className="font-medium">{p.nombre}</p><p className="text-xs text-ink-soft">{p.email}</p></div> },
    { key: 'rut', header: 'RUT', render: (p) => { const x = porUsuario.get(p.id); return x ? <Mono>{normalizarRut(x.rut)}</Mono> : <Badge tone="warn">Ficha pendiente</Badge> } },
    { key: 'afp', header: 'AFP', render: (p) => { const x = porUsuario.get(p.id); return x ? etiqueta(opciones.data?.afp, x.afp) : '—' } },
    { key: 'salud', header: 'Salud', render: (p) => { const x = porUsuario.get(p.id); return x ? (x.sistema_salud === 'ISAPRE' ? `Isapre · ${etiqueta(opciones.data?.isapre, x.isapre)}` : 'Fonasa') : '—' } },
    { key: 'contrato', header: 'Contrato', render: (p) => { const x = porUsuario.get(p.id); return x ? etiqueta(opciones.data?.tipo_contrato, x.tipo_contrato) : '—' } },
    { key: 'ingreso', header: 'Ingreso', render: (p) => { const x = porUsuario.get(p.id); return x ? <Mono>{formatFecha(x.fecha_ingreso)}</Mono> : '—' } },
    { key: 'acc', header: '', align: 'right', render: (p) => {
      const x = porUsuario.get(p.id)
      return (
        <Button size="sm" variant={x ? 'ghost' : 'secondary'} icon={x ? Pencil : IdCard} disabled={!opciones.data}
          onClick={() => setModal({ persona: p, ficha: x })}>{x ? 'Editar' : 'Completar ficha'}</Button>
      )
    } },
  ]
  const error = fichas.error ?? opciones.error
  const recargar = () => { fichas.reload(); onCambio() }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        {sinFicha > 0 ? `${sinFicha} ${sinFicha === 1 ? 'persona tiene' : 'personas tienen'} la ficha pendiente. ` : ''}
        La ficha define el RUT, la previsión, la salud y el tipo de contrato: es necesaria antes de crear un contrato.
      </p>
      {error ? <ErrorEstado error={error} onRetry={() => { fichas.reload(); opciones.reload() }} /> : (
        <DataTable columns={columnas} rows={personal} loading={(fichas.loading && !fichas.data) || (opciones.loading && !opciones.data)} rowKey={(p) => p.id} emptyTitle="Sin personal" />
      )}
      {modal && opciones.data && <FichaModal persona={modal.persona} ficha={modal.ficha} opciones={opciones.data} onClose={() => setModal(null)} onSaved={recargar} />}
    </div>
  )
}
