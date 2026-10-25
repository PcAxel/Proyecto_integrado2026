import { useState } from 'react'
import { Eye, EyeOff, Wand2, Copy, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal, Button, Input, Select, Mono } from '@/components/ui'
import { usuariosService } from '@/services'
import { ROLES, ROL_LABEL, ROL_DESCRIPCION } from '@/domain/rbac'
import { validarNuevoUsuario, validarEdicionUsuario, generarPasswordInicial } from '@/domain/usuarios'
import { normalizarRut } from '@/domain/rut'

const VACIO = { nombre: '', rut: '', cargo: '', rol: '', email: '', password: '' }

/** Campo de contraseña con mostrar/ocultar y generador. */
function CampoClave({ value, onChange, error, label = 'Contraseña inicial' }) {
  const [ver, setVer] = useState(false)
  return (
    <div>
      <div className="flex items-end gap-2">
        <Input className="min-w-0 flex-1" mono label={label} type={ver ? 'text' : 'password'} value={value} autoComplete="new-password"
          onChange={(e) => onChange(e.target.value)} error={error} hint={error ? undefined : 'Mínimo 8 caracteres, con letras y números'} />
        <Button type="button" variant="secondary" className="shrink-0" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVer((v) => !v)} icon={ver ? EyeOff : Eye} />
        <Button type="button" variant="secondary" className="shrink-0" icon={Wand2} onClick={() => { onChange(generarPasswordInicial()); setVer(true) }}>Generar</Button>
      </div>
    </div>
  )
}

/** Pantalla de confirmación con las credenciales para entregar al usuario (la clave no se vuelve a mostrar). */
function Credenciales({ usuario, password, onClose }) {
  const texto = `FYAG ERP\nUsuario: ${usuario.email}\nContraseña inicial: ${password}\nDeberá cambiarla al primer ingreso.`
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Credenciales copiadas')
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto manualmente.')
    }
  }
  return (
    <Modal open onClose={onClose} title="Acceso creado"
      footer={<><Button variant="secondary" icon={Copy} onClick={copiar}>Copiar credenciales</Button><Button onClick={onClose}>Listo</Button></>}>
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-ok"><CheckCircle2 className="h-5 w-5" />{usuario.nombre} ya puede ingresar.</p>
        <dl className="space-y-2 rounded-lg border border-line bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">Usuario</dt><dd><Mono>{usuario.email}</Mono></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">Contraseña inicial</dt><dd><Mono className="font-semibold">{password}</Mono></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">Rol</dt><dd>{ROL_LABEL[usuario.rol]}</dd></div>
        </dl>
        <p className="rounded-lg bg-warn-bg p-3 text-xs text-warn">Entrega estos datos en forma segura. La contraseña no se vuelve a mostrar y el usuario deberá cambiarla en su primer ingreso.</p>
        {usuario.rol === ROLES.TECNICO && <p className="text-xs text-ink-soft">Para recibir obras en la app de terreno, el técnico además necesita su ficha en <b>Personal y Flota</b>.</p>}
      </div>
    </Modal>
  )
}

/**
 * Alta ("Nuevo Acceso") y edición. En edición el RUT queda fijo porque es la identidad del usuario.
 * @param {{usuario?: any, usuarios: any[], actorId: string, onClose: ()=>void, onSaved: ()=>void}} props
 */
export function UsuarioFormModal({ usuario, usuarios, actorId, onClose, onSaved }) {
  const editando = Boolean(usuario)
  const [form, setForm] = useState(editando ? { ...VACIO, nombre: usuario.nombre, rut: usuario.rut, cargo: usuario.cargo, rol: usuario.rol, email: usuario.email } : VACIO)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [creado, setCreado] = useState(null)
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrores((e) => ({ ...e, [k]: undefined })) }

  if (creado) return <Credenciales {...creado} onClose={() => { onSaved(); onClose() }} />

  const guardar = async () => {
    const v = editando
      ? validarEdicionUsuario({ nombre: form.nombre, cargo: form.cargo, email: form.email, rol: form.rol }, { actual: usuario, usuarios, actorId })
      : validarNuevoUsuario(form, usuarios)
    if (!v.ok) return setErrores(v.errores)
    setGuardando(true)
    try {
      if (editando) {
        await usuariosService.update(usuario.id, { nombre: form.nombre, cargo: form.cargo, email: form.email, rol: form.rol })
        toast.success('Usuario actualizado')
        onSaved()
        onClose()
      } else {
        const nuevo = await usuariosService.create(form)
        setCreado({ usuario: nuevo, password: form.password })
      }
    } catch (e) {
      if (e.detail && typeof e.detail === 'object') setErrores(e.detail)
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={editando ? `Editar acceso · ${usuario.nombre}` : 'Nuevo acceso'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={guardando} onClick={guardar}>{editando ? 'Guardar cambios' : 'Crear acceso'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Nombre completo" value={form.nombre} onChange={(e) => set('nombre')(e.target.value)} error={errores.nombre} autoComplete="off" />
        <Input mono label="RUT" value={form.rut} disabled={editando} placeholder="12.345.678-5" onChange={(e) => set('rut')(e.target.value)}
          onBlur={() => !editando && form.rut && set('rut')(normalizarRut(form.rut))} error={errores.rut} hint={editando ? 'El RUT no se modifica' : undefined} />
        <Input label="Cargo" value={form.cargo} onChange={(e) => set('cargo')(e.target.value)} error={errores.cargo} />
        <div className="sm:col-span-2">
          <Select label="Rol" placeholder="Seleccione un rol…" value={form.rol} onChange={(e) => set('rol')(e.target.value)} error={errores.rol}
            options={Object.values(ROLES).map((r) => ({ value: r, label: ROL_LABEL[r] }))} />
          {form.rol && <p className="mt-1.5 text-xs text-ink-soft">{ROL_DESCRIPCION[form.rol]}</p>}
        </div>
        <Input className="sm:col-span-2" label="Correo" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} error={errores.email} autoComplete="off" />
        {!editando && <div className="sm:col-span-2"><CampoClave value={form.password} onChange={set('password')} error={errores.password} /></div>}
      </div>
      {!editando && <p className="mt-4 text-xs text-ink-faint">La contraseña se guarda cifrada y el usuario deberá cambiarla en su primer ingreso.</p>}
    </Modal>
  )
}

/** Restablece la contraseña inicial de un usuario. */
export function RestablecerClaveModal({ usuario, onClose, onSaved }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState(false)

  if (hecho) return <Credenciales usuario={usuario} password={password} onClose={() => { onSaved(); onClose() }} />

  const guardar = async () => {
    setGuardando(true)
    try {
      await usuariosService.restablecerPassword(usuario.id, password)
      setHecho(true)
    } catch (e) {
      setError(e.detail?.password ?? e.message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Restablecer contraseña · ${usuario.nombre}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={guardando} onClick={guardar} disabled={!password}>Restablecer</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Define una nueva contraseña inicial. La anterior deja de funcionar y el usuario deberá cambiarla al ingresar.</p>
        <CampoClave label="Nueva contraseña inicial" value={password} onChange={(v) => { setPassword(v); setError(undefined) }} error={error} />
      </div>
    </Modal>
  )
}
