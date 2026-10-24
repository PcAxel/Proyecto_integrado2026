import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, X, Save, Send, CheckCircle2, XCircle, HardHat, Lock } from 'lucide-react'
import { Button, IconButton, Input, Select, NumberField, Card, Skeleton, Modal, Textarea, PageHeader, Mono, cn } from '@/components/ui'
import { MoneyCell, PresupuestoStatusBadge, TIPO_OBRA_LABEL } from '@/components/domain'
import { presupuestosService, clientesService } from '@/services'
import { simularRentabilidad, puedeAprobarPresupuesto } from '@/domain/rentabilidad'
import { TIPOS_OBRA } from '@/domain/obras'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { SimuladorRentabilidad } from './SimuladorRentabilidad'

const VACIO = { titulo: '', cliente_id: '', tipo_obra: 'INSTALACION', materiales: [], mano_obra: [], adicionales: [], precio_venta_neto: null }

/** Carga el presupuesto (o uno vacío) y monta el formulario. */
export function PresupuestoEditor() {
  const { id } = useParams()
  const { data, reload } = useResource(() => (id ? presupuestosService.retrieve(id) : Promise.resolve(null)), [id])
  if (id && !data) return <div className="card"><Skeleton rows={8} /></div>
  // La clave incluye el estado: tras enviar/aprobar/rechazar el formulario se reinicia con los datos nuevos.
  return <EditorForm key={`${data?.id ?? 'nuevo'}-${data?.estado}`} inicial={data ?? VACIO} onCambioEstado={reload} />
}

function Seccion({ titulo, onAgregar, deshabilitado, children, total }) {
  return (
    <Card title={titulo} action={
      <div className="flex items-center gap-3">
        {total !== undefined && <MoneyCell value={total} className="text-sm font-semibold" />}
        {!deshabilitado && <Button size="sm" variant="secondary" icon={Plus} onClick={onAgregar}>Agregar</Button>}
      </div>
    }>{children}</Card>
  )
}

function EditorForm({ inicial, onCambioEstado }) {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.user.rol)
  const esNuevo = !inicial.id
  const [form, setForm] = useState(() => structuredClone({
    titulo: inicial.titulo, cliente_id: inicial.cliente_id, tipo_obra: inicial.tipo_obra, materiales: inicial.materiales,
    mano_obra: inicial.mano_obra, adicionales: inicial.adicionales, precio_venta_neto: inicial.precio_venta_neto,
  }))
  const [base, setBase] = useState(() => JSON.stringify(form))
  const [trabajando, setTrabajando] = useState(false)
  const [rechazo, setRechazo] = useState(null)

  const catalogo = useResource(() => presupuestosService.catalogoMateriales(), [])
  const tarifas = useResource(() => presupuestosService.tarifas(), [])
  const clientes = useResource(() => clientesService.list(), [])

  const estado = inicial.estado ?? 'BORRADOR'
  const editable = can(rol, 'presupuestos.crear') && ['BORRADOR', 'ENVIADO'].includes(estado)
  const sucio = JSON.stringify(form) !== base
  const sim = useMemo(() => simularRentabilidad(form), [form])
  const aprobacion = puedeAprobarPresupuesto(rol, sim)
  const valido = form.titulo.trim() && form.cliente_id && form.precio_venta_neto > 0

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))
  const setLinea = (campo, i, parcial) => setForm((f) => ({ ...f, [campo]: f[campo].map((l, j) => (j === i ? { ...l, ...parcial } : l)) }))
  const quitar = (campo, i) => setForm((f) => ({ ...f, [campo]: f[campo].filter((_, j) => j !== i) }))
  const agregar = (campo, linea) => setForm((f) => ({ ...f, [campo]: [...f[campo], linea] }))

  const elegirArticulo = (i, articuloId) => {
    const a = catalogo.data?.find((x) => x.id === articuloId)
    setLinea('materiales', i, { articulo_id: articuloId, costo_unitario: a?.costo_unitario ?? 0 })
  }
  const elegirCargo = (i, cargo) => {
    const t = tarifas.data?.find((x) => x.cargo === cargo)
    setLinea('mano_obra', i, { descripcion: cargo, costo_hora_hombre: t?.tarifa ?? 0 })
  }

  /** Guarda y devuelve el presupuesto persistido. */
  const guardar = async (mensaje = 'Presupuesto guardado') => {
    const r = await runAction(esNuevo ? presupuestosService.create(form) : presupuestosService.update(inicial.id, form), mensaje)
    if (r) setBase(JSON.stringify(form))
    return r
  }
  const accion = async (fn) => {
    setTrabajando(true)
    try { await fn() } finally { setTrabajando(false) }
  }

  const onGuardar = () => accion(async () => {
    const r = await guardar()
    if (r && esNuevo) navigate(`/erp/presupuestos/${r.id}`, { replace: true })
  })
  const onEnviar = () => accion(async () => {
    const r = await guardar('Presupuesto guardado')
    if (!r) return
    const e = await runAction(presupuestosService.enviar(r.id), 'Presupuesto enviado a aprobación')
    if (!e) return
    if (esNuevo) navigate(`/erp/presupuestos/${r.id}`, { replace: true })
    else onCambioEstado()
  })
  const onAprobar = () => accion(async () => {
    const r = await runAction(presupuestosService.aprobar(inicial.id), 'Presupuesto aprobado')
    if (r) onCambioEstado()
  })
  const onRechazar = () => accion(async () => {
    const r = await runAction(presupuestosService.rechazar(inicial.id, rechazo), 'Presupuesto rechazado')
    if (r) { setRechazo(null); onCambioEstado() }
  })

  const totales = { mat: sim.costoMateriales, mo: sim.costoManoObra, ad: sim.costoAdicionales }
  const opcionesArt = (catalogo.data ?? []).map((a) => ({ value: a.id, label: `${a.sku} · ${a.nombre}` }))
  const opcionesCargo = (tarifas.data ?? []).map((t) => ({ value: t.cargo, label: `${t.cargo}` }))

  return (
    <div className="space-y-5">
      <Link to="/erp/presupuestos" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />Presupuestos</Link>
      <PageHeader
        title={esNuevo ? 'Nuevo presupuesto' : inicial.titulo}
        subtitle={esNuevo ? 'Completa las líneas y revisa la rentabilidad en el panel' : <span className="inline-flex items-center gap-2"><Mono>{inicial.id}</Mono><PresupuestoStatusBadge estado={estado} /></span>}
      />
      {!editable && !esNuevo && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-sm text-ink-soft"><Lock className="h-4 w-4" />
          {estado === 'APROBADO' ? 'Un presupuesto aprobado es inmutable.' : estado === 'RECHAZADO' ? 'Presupuesto rechazado: solo lectura.' : 'Solo lectura para tu rol.'}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Card title="Datos generales">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input className="sm:col-span-3" label="Título" value={form.titulo} disabled={!editable} onChange={(e) => set('titulo', e.target.value)} />
              <Select label="Cliente" placeholder="Seleccione…" value={form.cliente_id} disabled={!editable} onChange={(e) => set('cliente_id', e.target.value)}
                options={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.razon_social }))} className="sm:col-span-2" />
              <Select label="Tipo de obra" value={form.tipo_obra} disabled={!editable} onChange={(e) => set('tipo_obra', e.target.value)}
                options={TIPOS_OBRA.map((t) => ({ value: t, label: TIPO_OBRA_LABEL[t] }))} />
            </div>
          </Card>

          <Seccion titulo="Materiales" total={totales.mat} deshabilitado={!editable} onAgregar={() => agregar('materiales', { articulo_id: '', cantidad: 1, costo_unitario: 0 })}>
            {form.materiales.length === 0 && <p className="text-sm text-ink-faint">Sin materiales.</p>}
            <div className="space-y-2">
              {form.materiales.map((m, i) => (
                <div key={i} className={cn('grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_6rem_2rem]', i > 0 && 'sm:[&_label>span.mb-1]:sr-only')}>
                  <Select className="col-span-2 sm:col-span-1" label="Artículo" placeholder="Seleccione…" value={m.articulo_id} disabled={!editable} onChange={(e) => elegirArticulo(i, e.target.value)} options={opcionesArt} />
                  <NumberField label="Cant." min={1} value={m.cantidad} disabled={!editable} onChange={(v) => setLinea('materiales', i, { cantidad: v ?? 0 })} />
                  <NumberField label="Costo unit." prefix="$" min={0} value={m.costo_unitario} disabled={!editable} onChange={(v) => setLinea('materiales', i, { costo_unitario: v ?? 0 })} />
                  <div className="pb-2 text-left sm:text-right"><p className={cn('mb-1 text-xs font-medium text-ink-soft', i > 0 && 'sm:hidden')}>Subtotal</p><MoneyCell value={m.cantidad * m.costo_unitario} className="text-sm" /></div>
                  {editable && <IconButton icon={X} label="Quitar línea" size="sm" className="justify-self-end" onClick={() => quitar('materiales', i)} />}
                </div>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Mano de obra (hora-hombre)" total={totales.mo} deshabilitado={!editable} onAgregar={() => agregar('mano_obra', { descripcion: '', horas: 1, costo_hora_hombre: 0 })}>
            {form.mano_obra.length === 0 && <p className="text-sm text-ink-faint">Sin mano de obra.</p>}
            <div className="space-y-2">
              {form.mano_obra.map((m, i) => (
                <div key={i} className={cn('grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_6rem_2rem]', i > 0 && 'sm:[&_label>span.mb-1]:sr-only')}>
                  <div>
                    <Select label="Perfil (tarifa promedio)" placeholder="Seleccione perfil…" value={opcionesCargo.some((o) => o.value === m.descripcion) ? m.descripcion : ''} disabled={!editable}
                      onChange={(e) => elegirCargo(i, e.target.value)} options={opcionesCargo} />
                  </div>
                  <NumberField label="Horas" min={0} step={0.5} value={m.horas} disabled={!editable} onChange={(v) => setLinea('mano_obra', i, { horas: v ?? 0 })} />
                  <NumberField label="Tarifa/h" prefix="$" min={0} value={m.costo_hora_hombre} disabled={!editable} onChange={(v) => setLinea('mano_obra', i, { costo_hora_hombre: v ?? 0 })} />
                  <div className="pb-2 text-left sm:text-right"><p className={cn('mb-1 text-xs font-medium text-ink-soft', i > 0 && 'sm:hidden')}>Subtotal</p><MoneyCell value={m.horas * m.costo_hora_hombre} className="text-sm" /></div>
                  {editable && <IconButton icon={X} label="Quitar línea" size="sm" className="justify-self-end" onClick={() => quitar('mano_obra', i)} />}
                </div>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Adicionales" total={totales.ad} deshabilitado={!editable} onAgregar={() => agregar('adicionales', { descripcion: '', monto: 0 })}>
            {form.adicionales.length === 0 && <p className="text-sm text-ink-faint">Sin adicionales (flete, viáticos, subcontratos…).</p>}
            <div className="space-y-2">
              {form.adicionales.map((a, i) => (
                <div key={i} className={cn('grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_2rem]', i > 0 && 'sm:[&_label>span.mb-1]:sr-only')}>
                  <Input className="col-span-2 sm:col-span-1" label="Descripción" value={a.descripcion} disabled={!editable} onChange={(e) => setLinea('adicionales', i, { descripcion: e.target.value })} />
                  <NumberField label="Monto" prefix="$" min={0} value={a.monto} disabled={!editable} onChange={(v) => setLinea('adicionales', i, { monto: v ?? 0 })} />
                  {editable && <IconButton icon={X} label="Quitar línea" size="sm" className="justify-self-end" onClick={() => quitar('adicionales', i)} />}
                </div>
              ))}
            </div>
          </Seccion>

          <Card title="Precio de venta">
            <NumberField label="Precio de venta neto (sin IVA)" prefix="$" min={0} size="lg" value={form.precio_venta_neto} disabled={!editable}
              onChange={(v) => set('precio_venta_neto', v)} hint="El simulador recalcula el margen mientras escribes." className="max-w-sm" />
          </Card>
        </div>

        <SimuladorRentabilidad sim={sim} aprobacion={estado === 'ENVIADO' ? aprobacion : undefined} editable={editable} onAplicarSugerido={() => set('precio_venta_neto', sim.precioSugerido)}>
          {editable && <Button className="w-full" variant="secondary" icon={Save} loading={trabajando} disabled={!valido || (!esNuevo && !sucio)} onClick={onGuardar}>Guardar {esNuevo ? 'borrador' : 'cambios'}</Button>}
          {editable && estado === 'BORRADOR' && <Button className="w-full" icon={Send} loading={trabajando} disabled={!valido} onClick={onEnviar}>Guardar y enviar a aprobación</Button>}
          {estado === 'ENVIADO' && can(rol, 'presupuestos.aprobar') && (
            <>
              <Button className="w-full" icon={CheckCircle2} loading={trabajando} disabled={!aprobacion.ok || sucio} onClick={onAprobar}>Aprobar presupuesto</Button>
              {sucio && <p className="text-xs text-ink-soft">Guarda los cambios antes de aprobar.</p>}
              <Button className="w-full" variant="secondary" icon={XCircle} disabled={sucio} onClick={() => setRechazo('')}>Rechazar</Button>
            </>
          )}
          {estado === 'APROBADO' && can(rol, 'obras.crear') && (
            inicial.obra_id
              ? <Link to={`/erp/obras/${inicial.obra_id}`} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium hover:bg-slate-50"><HardHat className="h-4 w-4" />Ver obra {inicial.obra_id}</Link>
              : <Button className="w-full" icon={HardHat} onClick={() => navigate(`/erp/obras/nueva?presupuesto=${inicial.id}`)}>Crear obra desde este presupuesto</Button>
          )}
        </SimuladorRentabilidad>
      </div>

      <Modal open={rechazo !== null} onClose={() => setRechazo(null)} title="Rechazar presupuesto"
        footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button><Button variant="danger" loading={trabajando} disabled={!rechazo?.trim()} onClick={onRechazar}>Rechazar</Button></>}>
        <Textarea label="Motivo" value={rechazo ?? ''} onChange={(e) => setRechazo(e.target.value)} />
      </Modal>
    </div>
  )
}
