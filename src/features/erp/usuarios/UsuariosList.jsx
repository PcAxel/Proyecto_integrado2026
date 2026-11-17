import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizar } from '@/domain/busqueda'
import { FiltroBusqueda } from '@/components/FiltroBusqueda'
import { UserPlus, ShieldCheck, ShieldOff, UserX, UserCheck, Pencil } from 'lucide-react'
import { PageHeader, Button, Card, DataTable, Modal, Input, Select, Badge, Mono, ConfirmDialog } from '@/components/ui'
import { RolBadge } from '@/components/domain'
import { ROL_API_LABEL } from '@/components/domain/RolBadge'
import { ROL_DESCRIPCION } from '@/domain/rbac'
import { rolUiDesdeApi } from '@/domain/rolesApi'
import { ErrorEstado } from '@/components/ErrorEstado'
import { usuariosService } from '@/services'
import { formatFechaHora } from '@/domain/format'
import { useResource } from '@/hooks/useResource'
import { toast } from 'sonner'
import { runAction } from '@/hooks/runAction'
import { useAuthStore } from '@/stores/authStore'

const ROLES = Object.entries(ROL_API_LABEL).map(([value, label]) => ({ value, label }))

/** Edita el nombre y el rol de un acceso existente. El correo no cambia; el rol propio tampoco (lo impide también el servidor). */
function EditarUsuarioModal({ usuario, esPropio, onClose, onSaved }) {
  const [f, setF] = useState({ first_name: usuario.first_name ?? '', last_name: usuario.last_name ?? '', role: usuario.role })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const cambiaRol = f.role !== usuario.role
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      await usuariosService.update(usuario.id, esPropio ? { first_name: f.first_name, last_name: f.last_name } : f)
      toast.success(cambiaRol ? `Rol actualizado. ${usuario.email} deberá iniciar sesión de nuevo.` : 'Acceso actualizado')
      onSaved()
      onClose()
    } catch (err) { setErrores(err.data && typeof err.data === 'object' && !err.data.detail ? err.data : { _: [err.message] }) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title="Editar acceso"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-editar-usuario" loading={guardando}>Guardar cambios</Button></>}>
      <form id="form-editar-usuario" onSubmit={guardar} className="space-y-4">
        <p className="text-sm text-ink-soft">{usuario.email}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={f.first_name} onChange={set('first_name')} />
          <Input label="Apellido" value={f.last_name} onChange={set('last_name')} />
        </div>
        <Select label="Rol" value={f.role} onChange={set('role')} options={ROLES} disabled={esPropio} error={errores.role?.[0]} />
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft">{esPropio ? 'No puedes cambiar tu propio rol: debe hacerlo otra persona que administre accesos.' : ROL_DESCRIPCION[rolUiDesdeApi(f.role)]}</p>
        {cambiaRol && <p className="text-xs font-medium text-warn">Al cambiar el rol se cerrarán las sesiones abiertas de esta persona.</p>}
        {errores._ && <p role="alert" className="text-sm font-medium text-crit">{errores._[0]}</p>}
      </form>
    </Modal>
  )
}

function UsuarioModal({ onClose, onSaved }) {
  const [f, setF] = useState({ email: '', first_name: '', last_name: '', role: 'TECNICO' })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      const r = await usuariosService.create(f)
      if (r.email_sent) toast.success(`Acceso creado. Enviamos las credenciales a ${r.email}.`)
      else toast.warning('Acceso creado, pero el correo no pudo enviarse. Revisa la configuración de correo del servidor.')
      onSaved()
      onClose()
    } catch (err) { setErrores(err.data && typeof err.data === 'object' ? err.data : { _: [err.message] }) } finally { setGuardando(false) }
  }
  return (
    <Modal open onClose={onClose} title="Nuevo acceso"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-usuario" loading={guardando}>Crear y enviar correo</Button></>}>
      <form id="form-usuario" onSubmit={guardar} className="space-y-4">
        <Input label="Correo" type="email" required value={f.email} onChange={set('email')} error={errores.email?.[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={f.first_name} onChange={set('first_name')} />
          <Input label="Apellido" value={f.last_name} onChange={set('last_name')} />
        </div>
        <Select label="Rol" value={f.role} onChange={set('role')} options={ROLES} error={errores.role?.[0]} />
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft">{ROL_DESCRIPCION[rolUiDesdeApi(f.role)]}</p>
        <p className="text-xs text-ink-soft">El servidor genera una contraseña temporal y la envía por correo junto al link de instalación de la app.</p>
        {errores._ && <p role="alert" className="text-sm font-medium text-crit">{errores._[0]}</p>}
      </form>
    </Modal>
  )
}

export function UsuariosList() {
  const [params, setParams] = useSearchParams()
  const buscar = params.get('buscar') ?? ''
  const [modal, setModal] = useState(params.get('nuevo') === '1')
  const yo = useAuthStore((s) => s.user?.pk) // id numérico del servidor, el mismo que trae cada fila
  const [editando, setEditando] = useState(null)
  const { data, loading, error, reload } = useResource(() => usuariosService.list(), [])
  const [cambio, setCambio] = useState(null) // usuario a desactivar o reactivar
  const [procesando, setProcesando] = useState(false)
  const confirmarCambio = async () => {
    setProcesando(true)
    const r = await runAction(cambio.is_active ? usuariosService.desactivar(cambio.id) : usuariosService.reactivar(cambio.id), cambio.is_active ? 'Acceso desactivado' : cambio.bloqueada ? 'Cuenta desbloqueada' : 'Acceso reactivado')
    setProcesando(false)
    if (r) { setCambio(null); reload() }
  }
  const columns = [
    { key: 'nombre', header: 'Usuario', render: (u) => <div><p className="font-medium">{`${u.first_name} ${u.last_name}`.trim() || '—'}</p><p className="text-xs text-ink-soft">{u.email}</p></div> },
    { key: 'acceso', header: 'Acceso', render: (u) => (u.is_active ? <Badge tone="ok">Activo</Badge> : <div>{u.bloqueada ? <Badge tone="crit">Bloqueada por intentos fallidos</Badge> : <Badge tone="crit">Desactivado</Badge>}{u.deactivated_at && <p className="mt-0.5 text-[11px] text-ink-soft">{formatFechaHora(u.deactivated_at)}</p>}</div>) },
    { key: 'role', header: 'Rol', render: (u) => <RolBadge rol={u.role} /> },
    { key: '2fa', header: '2FA', render: (u) => (u.is_2fa_enabled ? <Badge tone="ok" icon={ShieldCheck}>Vinculado</Badge> : <Badge tone="warn" icon={ShieldOff}>Pendiente</Badge>) },
    { key: 'terms', header: 'Términos', render: (u) => (u.terms_accepted_at ? <Mono className="text-xs">{formatFechaHora(u.terms_accepted_at)}</Mono> : <Badge tone="warn">Sin aceptar</Badge>) },
    // Nunca se elimina un usuario (trazabilidad): solo se desactiva el acceso o se devuelve. Nadie puede desactivarse a sí mismo.
    { key: 'acciones', header: '', align: 'right', render: (u) => (
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditando(u)}>Editar</Button>
        {u.id === yo ? <span className="text-xs text-ink-soft">Tu cuenta</span> : (
          <Button size="sm" variant="secondary" icon={u.is_active ? UserX : UserCheck} onClick={() => setCambio(u)}>{u.is_active ? 'Desactivar' : u.bloqueada ? 'Desbloquear' : 'Reactivar'}</Button>
        )}
      </div>
    ) },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Accesos y Usuarios" subtitle="Cuentas del sistema, administradas en el servidor central"
        actions={<Button icon={UserPlus} onClick={() => setModal(true)}>Nuevo acceso</Button>} />
      <Card padded={false}>
        {buscar && <FiltroBusqueda texto={buscar} onQuitar={() => setParams({})} />}
        {error ? <ErrorEstado error={error} onReintentar={reload} /> : (
          <DataTable columns={columns} rows={(data ?? []).filter((u) => !buscar || normalizar(`${u.email} ${u.first_name} ${u.last_name}`).includes(normalizar(buscar)))} rowKey={(u) => u.id} loading={loading && !data} emptyTitle="Sin usuarios" />
        )}
      </Card>
      {modal && <UsuarioModal onClose={() => setModal(false)} onSaved={reload} />}
      {editando && <EditarUsuarioModal usuario={editando} esPropio={editando.id === yo} onClose={() => setEditando(null)} onSaved={reload} />}
      <ConfirmDialog
        open={Boolean(cambio)} onClose={() => setCambio(null)} onConfirm={confirmarCambio} loading={procesando}
        tone={cambio?.is_active ? 'danger' : 'primary'}
        title={cambio?.is_active ? 'Desactivar acceso' : cambio?.bloqueada ? 'Desbloquear cuenta' : 'Reactivar acceso'}
        message={cambio?.is_active
          ? `${cambio?.email} dejará de poder entrar y se cerrarán sus sesiones abiertas. La cuenta no se elimina: su historial y sus registros se conservan, y puedes reactivarla cuando quieras.`
          : cambio?.bloqueada
            ? `${cambio?.email} se bloqueó por demasiados intentos fallidos. Al desbloquearla vuelve a poder entrar, con su contraseña y su 2FA actuales y los intentos en cero.`
            : `${cambio?.email} volverá a poder entrar con su contraseña y su 2FA actuales.`}
        confirmLabel={cambio?.is_active ? 'Desactivar' : cambio?.bloqueada ? 'Desbloquear' : 'Reactivar'}
      />
    </div>
  )
}
