import { useState } from 'react'
import { Plus, Pencil, Power } from 'lucide-react'
import { Card, DataTable, Button, IconButton, Badge, Modal, Input, ConfirmDialog, Mono, ExportMenu } from '@/components/ui'
import { validarRut } from '@/domain/rut'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

/**
 * Tabla + formulario genérico para un maestro (cliente o proveedor). Nunca borra: desactiva.
 * @param {{singular:string, plural:string, servicio:any, campos:Array<{clave:string,label:string,tipo?:string,ancho?:string}>, columnas:any[], exportar:any[]}} props
 */
export function MaestroTab({ singular, plural, servicio, campos, columnas, exportar }) {
  const rol = useAuthStore((s) => s.user.rol)
  const gestiona = can(rol, 'maestros.gestionar')
  const { data, loading, reload } = useResource(() => servicio.list({ incluirInactivos: true }), [])
  const [form, setForm] = useState(null) // { id?, datos }
  const [toggle, setToggle] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verInactivos, setVerInactivos] = useState(false)
  const filas = (data ?? []).filter((r) => verInactivos || r.activo)

  const rutInvalido = form && !form.id && form.datos.rut && !validarRut(form.datos.rut)
  const valido = form && campos.every((c) => c.opcional || String(form.datos[c.clave] ?? '').trim()) && !rutInvalido

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(form.id ? servicio.update(form.id, form.datos) : servicio.create(form.datos), form.id ? `${singular} actualizado` : `${singular} creado`)
    setGuardando(false)
    if (r) { setForm(null); reload() }
  }
  const confirmar = async () => {
    const r = await runAction(servicio.setActivo(toggle.id, !toggle.activo), toggle.activo ? `${singular} desactivado` : `${singular} activado`)
    if (r) { setToggle(null); reload() }
  }

  const cols = [
    ...columnas,
    { key: 'activo', header: 'Estado', render: (r) => <Badge tone={r.activo ? 'ok' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge> },
    ...(gestiona ? [{ key: 'acc', header: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-0.5">
        <IconButton icon={Pencil} label={`Editar ${singular.toLowerCase()}`} size="sm" onClick={() => setForm({ id: r.id, datos: { ...r } })} />
        <IconButton icon={Power} label={r.activo ? 'Desactivar' : 'Activar'} size="sm" onClick={() => setToggle(r)} />
      </div>
    ) }] : []),
  ]

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-brand" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />Ver inactivos</label>
          <Mono className="text-xs text-ink-soft">{filas.length} resultados</Mono>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <ExportMenu nombre={plural} titulo={plural} columnas={exportar} filas={filas} />
            {gestiona && <Button icon={Plus} onClick={() => setForm({ datos: {} })}>Nuevo {singular.toLowerCase()}</Button>}
          </div>
        </div>
        <DataTable columns={cols} rows={filas} rowKey={(r) => r.id} loading={loading && !data} />
      </Card>

      {form && (
        <Modal open onClose={() => setForm(null)} size="lg" title={form.id ? `Editar ${form.datos.razon_social}` : `Nuevo ${singular.toLowerCase()}`}
          footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button loading={guardando} disabled={!valido} onClick={guardar}>Guardar</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {campos.map((c) => (
              <Input key={c.clave} className={c.ancho} label={c.label} type={c.tipo} mono={c.clave === 'rut'} value={form.datos[c.clave] ?? ''}
                disabled={c.clave === 'rut' && Boolean(form.id)} hint={c.clave === 'rut' && !form.id ? 'Formato 12.345.678-5' : undefined}
                error={c.clave === 'rut' && rutInvalido ? 'RUT inválido (dígito verificador)' : undefined}
                onChange={(e) => setForm({ ...form, datos: { ...form.datos, [c.clave]: e.target.value } })} />
            ))}
          </div>
        </Modal>
      )}
      <ConfirmDialog open={Boolean(toggle)} onClose={() => setToggle(null)} onConfirm={confirmar} confirmLabel={toggle?.activo ? 'Desactivar' : 'Activar'}
        title={toggle?.activo ? `Desactivar ${singular.toLowerCase()}` : `Activar ${singular.toLowerCase()}`}
        message={toggle?.activo ? `${toggle?.razon_social} no aparecerá en nuevas operaciones. El historial se conserva (no se elimina).` : `${toggle?.razon_social} volverá a estar disponible.`} />
    </>
  )
}
