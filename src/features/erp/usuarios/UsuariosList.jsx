import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizar } from '@/domain/busqueda'
import { FiltroBusqueda } from '@/components/FiltroBusqueda'
import { UserPlus, ShieldCheck, ShieldOff, UserX, UserCheck, Pencil, KeyRound, Copy, Wand2 } from 'lucide-react'
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
import { generarClave, problemaDeClave } from '@/domain/claves'

const ROLES = Object.entries(ROL_API_LABEL).map(([value, label]) => ({ value, label }))

/** Entrega la contraseña temporal UNA vez: el servidor no la vuelve a mostrar. Sirve aunque el correo no llegue. */
function CredencialesModal({ email, clave, correoEnviado, onClose }) {
  const copiar = async () => { try { await navigator.clipboard.writeText(`Correo: ${email}\nContraseña temporal: ${clave}`); toast.success('Copiado') } catch { toast.error('No se pudo copiar: selecciónala y cópiala a mano') } }
  return (
    <Modal open onClose={onClose} title="Credenciales de acceso"
      footer={<><Button variant="secondary" icon={Copy} onClick={copiar}>Copiar</Button><Button onClick={onClose}>Listo, ya la anoté</Button></>}>
      <div className="space-y-4">
        <p className={`rounded-lg p-3 text-sm ${correoEnviado ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}>
          {correoEnviado ? `También se envió por correo a ${email}.` : 'No se envió ningún correo (o no pudo enviarse): entrégale estas credenciales tú, por un medio seguro.'}
        </p>
        <dl className="space-y-2 rounded-lg border border-line bg-slate-50 p-3 text-sm">
          <div><dt className="text-xs text-ink-soft">Correo</dt><dd className="font-medium">{email}</dd></div>
          <div><dt className="text-xs text-ink-soft">Contraseña temporal</dt><dd><Mono className="select-all text-base font-semibold">{clave}</Mono></dd></div>
        </dl>
        <p className="text-xs text-ink-soft"><b>Se muestra una sola vez</b>: al cerrar esta ventana no se puede volver a ver. En su primer ingreso la persona vincula su autenticador; pídele que cambie la contraseña apenas pueda.</p>
      </div>
    </Modal>
  )
}

/** TI fija (o genera) una contraseña temporal nueva para otra cuenta: sirve cuando el correo de recuperación no llega. */
function RestablecerClaveModal({ usuario, onClose, onSaved }) {
  const [clave, setClave] = useState('')
  const [enviar, setEnviar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const [entrega, setEntrega] = useState(null)
  const aviso = problemaDeClave(clave)
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      const r = await usuariosService.restablecerClave(usuario.id, { ...(clave ? { password: clave } : {}), enviar_correo: enviar })
      setEntrega({ clave: r.password_temporal, correo: r.email_sent })
      onSaved()
    } catch (err) { setErrores(err.data && typeof err.data === 'object' ? err.data : { _: [err.message] }) } finally { setGuardando(false) }
  }
  if (entrega) return <CredencialesModal email={usuario.email} clave={entrega.clave} correoEnviado={entrega.correo} onClose={onClose} />
  return (
    <Modal open onClose={onClose} title="Restablecer contraseña"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-restablecer" loading={guardando} disabled={Boolean(aviso)} icon={KeyRound}>Restablecer</Button></>}>
      <form id="form-restablecer" onSubmit={guardar} className="space-y-4">
        <p className="text-sm text-ink-soft">{usuario.email}. Se cerrarán sus sesiones abiertas y se quitará el bloqueo por intentos fallidos. Su autenticador no cambia.</p>
        <div>
          <Input label="Contraseña temporal (opcional)" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Déjala vacía para que el sistema genere una" autoComplete="off" mono error={aviso ?? errores.password?.[0]} />
          <Button type="button" size="sm" variant="ghost" icon={Wand2} className="mt-1" onClick={() => setClave(generarClave())}>Generar una segura</Button>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={enviar} onChange={(e) => setEnviar(e.target.checked)} />También enviarla por correo</label>
        {errores._ && <p role="alert" className="text-sm font-medium text-crit">{errores._[0]}</p>}
      </form>
    </Modal>
  )
}

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
  const [f, setF] = useState({ email: '', first_name: '', last_name: '', role: 'TECNICO', password: '', enviar_correo: true })
  const [entrega, setEntrega] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const guardar = async (ev) => {
    ev.preventDefault()
    setGuardando(true)
    setErrores({})
    try {
      const { password, ...resto } = f
      const r = await usuariosService.create({ ...resto, ...(password ? { password } : {}) })
      onSaved()
      setEntrega({ email: r.email, clave: r.password_temporal, correo: r.email_sent }) // se muestra siempre: si el correo no llega, igual se puede entregar
    } catch (err) { setErrores(err.data && typeof err.data === 'object' ? err.data : { _: [err.message] }) } finally { setGuardando(false) }
  }
  const aviso = problemaDeClave(f.password)
  if (entrega) return <CredencialesModal email={entrega.email} clave={entrega.clave} correoEnviado={entrega.correo} onClose={onClose} />
  return (
    <Modal open onClose={onClose} title="Nuevo acceso"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-usuario" loading={guardando} disabled={Boolean(aviso)}>{f.enviar_correo ? 'Crear y enviar correo' : 'Crear acceso'}</Button></>}>
      <form id="form-usuario" onSubmit={guardar} className="space-y-4">
        <Input label="Correo" type="email" required value={f.email} onChange={set('email')} error={errores.email?.[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={f.first_name} onChange={set('first_name')} />
          <Input label="Apellido" value={f.last_name} onChange={set('last_name')} />
        </div>
        <Select label="Rol" value={f.role} onChange={set('role')} options={ROLES} error={errores.role?.[0]} />
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft">{ROL_DESCRIPCION[rolUiDesdeApi(f.role)]}</p>
        <div>
          <Input label="Contraseña inicial (opcional)" value={f.password} onChange={set('password')} placeholder="Déjala vacía para que el sistema genere una" autoComplete="off" mono error={aviso ?? errores.password?.[0]} />
          <Button type="button" size="sm" variant="ghost" icon={Wand2} className="mt-1" onClick={() => setF({ ...f, password: generarClave() })}>Generar una segura</Button>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.enviar_correo} onChange={(ev) => setF({ ...f, enviar_correo: ev.target.checked })} />Enviar las credenciales por correo</label>
        <p className="text-xs text-ink-soft">Al crear el acceso verás la contraseña <b>una sola vez</b>, aunque el correo no llegue.</p>
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
  const [restableciendo, setRestableciendo] = useState(null) // solo TI
  const rolApi = useAuthStore((s) => s.user?.rolApi)
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
        {rolApi === 'SUPERADMIN' && u.id !== yo && <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setRestableciendo(u)}>Contraseña</Button>}
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
      {restableciendo && <RestablecerClaveModal usuario={restableciendo} onClose={() => setRestableciendo(null)} onSaved={reload} />}
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
