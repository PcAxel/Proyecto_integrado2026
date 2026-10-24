import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, Card, Input, Select, NumberField, Button } from '@/components/ui'
import { TIPO_OBRA_LABEL } from '@/components/domain'
import { obrasService, presupuestosService, clientesService } from '@/services'
import { TIPOS_OBRA, TIPOS_SIN_PRESUPUESTO, validarCreacionObra } from '@/domain/obras'
import { COMUNAS_NUBLE } from '@/domain/geo'
import { fechaLocal } from '@/domain/format'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { ToggleEmergencia } from './ToggleEmergencia'

export function ObraForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const rol = useAuthStore((s) => s.user.rol)
  const clientes = useResource(() => clientesService.list(), [])
  const presupuestos = useResource(() => presupuestosService.list({ estado: 'APROBADO' }), [])
  const tecnicos = useResource(() => obrasService.tecnicosDisponibles(), [])
  const [guardando, setGuardando] = useState(false)
  const [sinPresupuesto, setSinPresupuesto] = useState(false)
  const [form, setForm] = useState({
    nombre: '', cliente_id: '', tipo: 'INSTALACION', presupuesto_id: '', comuna: 'Chillán', direccion: '',
    ...COMUNAS_NUBLE['Chillán'], radio_m: 150, tecnicos: [], fecha_inicio: fechaLocal(), fecha_fin_estimada: '',
  })
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  // Preselección desde «Crear obra desde este presupuesto».
  const pre = params.get('presupuesto')
  useEffect(() => {
    const p = presupuestos.data?.find((x) => x.id === pre)
    if (p) setForm((f) => (f.presupuesto_id === p.id ? f : { ...f, presupuesto_id: p.id, cliente_id: p.cliente_id, tipo: p.tipo_obra, nombre: f.nombre || p.titulo }))
  }, [pre, presupuestos.data])

  const libres = (presupuestos.data ?? []).filter((p) => !p.obra_id && (!form.cliente_id || p.cliente_id === form.cliente_id))
  const permiteCU30 = TIPOS_SIN_PRESUPUESTO.includes(form.tipo)
  const usaCU30 = permiteCU30 && sinPresupuesto
  const validacion = validarCreacionObra({ tipo: form.tipo, presupuesto_id: usaCU30 ? null : form.presupuesto_id || null }, presupuestos.data ?? [])
  const errorPresupuesto = form.cliente_id && !validacion.ok && form.presupuesto_id === '' ? validacion.error : null
  const valido = form.nombre.trim() && form.cliente_id && validacion.ok && form.direccion.trim() && (!usaCU30 || can(rol, 'obras.emergencia'))

  const cambiarComuna = (comuna) => setForm((f) => ({ ...f, comuna, ...COMUNAS_NUBLE[comuna] }))
  const alternarTecnico = (id) => set('tecnicos', form.tecnicos.includes(id) ? form.tecnicos.filter((t) => t !== id) : [...form.tecnicos, id])

  const guardar = async () => {
    setGuardando(true)
    const { comuna, direccion, lat, lng, radio_m, ...resto } = form
    const r = await runAction(obrasService.create({
      ...resto, presupuesto_id: usaCU30 ? null : form.presupuesto_id || null, fecha_fin_estimada: form.fecha_fin_estimada || null,
      ubicacion: { comuna, direccion, lat, lng, radio_m },
    }), usaCU30 ? 'Obra CU30 creada: regularice el presupuesto antes de finalizar' : 'Obra creada')
    setGuardando(false)
    if (r) navigate(`/erp/obras/${r.id}`, { replace: true })
  }

  return (
    <div className="space-y-5">
      <Link to="/erp/obras" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />Obras</Link>
      <PageHeader title="Nueva obra" subtitle="Una obra requiere presupuesto aprobado, salvo Emergencia o Garantía (CU30)" />

      <div className="grid w-full items-start gap-5 xl:grid-cols-2">
        <Card title="Datos generales">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Nombre de la obra" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            <Select label="Cliente" placeholder="Seleccione…" value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value, presupuesto_id: '' }))}
              options={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.razon_social }))} />
            <Select label="Tipo" value={form.tipo} onChange={(e) => { set('tipo', e.target.value); setSinPresupuesto(false) }}
              options={TIPOS_OBRA.map((t) => ({ value: t, label: TIPO_OBRA_LABEL[t] }))} />
          </div>
        </Card>

        <Card title="Presupuesto">
          <div className="space-y-4">
            {permiteCU30 && <ToggleEmergencia checked={sinPresupuesto} onChange={setSinPresupuesto} permitido={can(rol, 'obras.emergencia')} />}
            {!usaCU30 && (
              <Select label="Presupuesto aprobado" placeholder={libres.length ? 'Seleccione…' : 'Sin presupuestos aprobados disponibles'} value={form.presupuesto_id}
                onChange={(e) => set('presupuesto_id', e.target.value)} error={errorPresupuesto ?? undefined}
                hint="Solo aparecen presupuestos aprobados del cliente que aún no tienen obra."
                options={libres.map((p) => ({ value: p.id, label: `${p.id} · ${p.titulo}` }))} />
            )}
          </div>
        </Card>

        <Card title="Ubicación y geocerca">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Comuna" value={form.comuna} onChange={(e) => cambiarComuna(e.target.value)} options={Object.keys(COMUNAS_NUBLE).map((c) => ({ value: c, label: c }))} />
            <Input className="sm:col-span-2" label="Dirección" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} />
            <NumberField label="Latitud" step={0.0001} value={form.lat} onChange={(v) => set('lat', v)} />
            <NumberField label="Longitud" step={0.0001} value={form.lng} onChange={(v) => set('lng', v)} />
            <NumberField label="Radio de geocerca" suffix="m" min={50} step={10} value={form.radio_m} onChange={(v) => set('radio_m', v ?? 150)} hint="Las fotos fuera del radio se marcan en la auditoría." />
          </div>
        </Card>

        <Card title="Plazo y equipo">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Inicio" type="date" value={form.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} />
            <Input label="Término estimado" type="date" value={form.fecha_fin_estimada} min={form.fecha_inicio} onChange={(e) => set('fecha_fin_estimada', e.target.value)} />
          </div>
          <p className="mb-2 mt-5 text-xs font-medium text-ink-soft">Técnicos asignados ({form.tecnicos.length})</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {(tecnicos.data ?? []).map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.tecnicos.includes(t.id)} onChange={() => alternarTecnico(t.id)} />
                <span>{t.nombre}</span><span className="text-xs text-ink-faint">{t.cargo}</span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-2 xl:col-span-full">
          <Button variant="secondary" onClick={() => navigate('/erp/obras')}>Cancelar</Button>
          <Button loading={guardando} disabled={!valido} onClick={guardar}>{usaCU30 ? 'Abrir obra sin presupuesto' : 'Crear obra'}</Button>
        </div>
      </div>
    </div>
  )
}
