import { db } from '@/mocks/db'
import { validarNuevoUsuario, validarEdicionUsuario, puedeCambiarEstado, validarPassword } from '@/domain/usuarios'
import { respond, requirePermiso, ApiError, ahora } from './http'
import { registrarAuditoria } from './auditoria.service'
import { hashPassword, nuevaSal } from './seguridad'

/** Nunca sale del servicio ni el hash ni la sal. */
const publico = ({ password_hash, password_salt, ...u }) => ({ ...u, tiene_password: Boolean(password_hash) })

const buscar = (id) => {
  const u = db.find('usuarios', id)
  if (!u) throw new ApiError(404, 'Usuario no encontrado.')
  return u
}

/** Gestión de accesos (solo Gerencia General). No existe eliminación: un acceso se desactiva. */
export const usuariosService = {
  list() {
    return respond(() => {
      requirePermiso('usuarios.ver')
      return db.all('usuarios').map(publico)
    })
  },
  /** @param {{nombre:string, rut:string, cargo:string, rol:string, email:string, password:string}} data */
  create(data) {
    return respond(async () => {
      const actor = requirePermiso('usuarios.crear')
      const v = validarNuevoUsuario(data, db.all('usuarios'))
      if (!v.ok) throw new ApiError(422, 'Revisa los datos del formulario.', v.errores)
      const sal = nuevaSal()
      const usuario = db.insert('usuarios', {
        id: db.nextId('usuarios'), ...v.datos, activo: true, debe_cambiar_password: true,
        creado_en: ahora(), creado_por: actor.id, password_salt: sal, password_hash: await hashPassword(data.password, sal),
      })
      registrarAuditoria({ entidad: 'Usuario', entidad_id: usuario.id, accion: 'CREAR', nuevo: { nombre: usuario.nombre, rut: usuario.rut, rol: usuario.rol, email: usuario.email } })
      return publico(usuario)
    })
  },
  /** Edita nombre, cargo, correo y rol. El RUT es la identidad y no se modifica. */
  update(id, cambios) {
    return respond(() => {
      const actor = requirePermiso('usuarios.editar')
      const actual = buscar(id)
      const v = validarEdicionUsuario(cambios, { actual, usuarios: db.all('usuarios'), actorId: actor.id })
      if (!v.ok) throw new ApiError(422, 'Revisa los datos del formulario.', v.errores)
      const anterior = Object.fromEntries(Object.keys(v.datos).filter((k) => v.datos[k] !== actual[k]).map((k) => [k, actual[k]]))
      if (!Object.keys(anterior).length) return publico(actual)
      const nuevo = Object.fromEntries(Object.keys(anterior).map((k) => [k, v.datos[k]]))
      db.patch('usuarios', id, nuevo)
      registrarAuditoria({ entidad: 'Usuario', entidad_id: id, accion: anterior.rol ? 'CAMBIAR_ROL' : 'ACTUALIZAR', anterior, nuevo })
      return publico(actual)
    })
  },
  setActivo(id, activo) {
    return respond(() => {
      const actor = requirePermiso('usuarios.editar')
      const objetivo = buscar(id)
      const regla = puedeCambiarEstado({ objetivo, activo, usuarios: db.all('usuarios'), actorId: actor.id })
      if (!regla.ok) throw new ApiError(409, regla.motivo)
      if (objetivo.activo === activo) return publico(objetivo)
      db.patch('usuarios', id, { activo })
      registrarAuditoria({ entidad: 'Usuario', entidad_id: id, accion: activo ? 'ACTIVAR' : 'DESACTIVAR', anterior: { activo: !activo }, nuevo: { activo } })
      return publico(objetivo)
    })
  },
  /** Define una nueva contraseña inicial; el usuario deberá cambiarla al ingresar. La clave no se registra en la auditoría. */
  restablecerPassword(id, password) {
    return respond(async () => {
      requirePermiso('usuarios.editar')
      const objetivo = buscar(id)
      const pw = validarPassword(password)
      if (!pw.ok) throw new ApiError(422, pw.error, { password: pw.error })
      const sal = nuevaSal()
      db.patch('usuarios', id, { password_salt: sal, password_hash: await hashPassword(password, sal), debe_cambiar_password: true })
      registrarAuditoria({ entidad: 'Usuario', entidad_id: id, accion: 'RESTABLECER_CLAVE', nuevo: { debe_cambiar_password: true } })
      return publico(objetivo)
    })
  },
  /**
   * Perfiles activos para la pantalla de ingreso demo y el selector de rol. Es público a propósito
   * (aún no hay sesión): solo expone lo necesario para mostrar la tarjeta. El backend real usará credenciales.
   */
  perfiles() {
    return respond(() => db.all('usuarios').filter((u) => u.activo).map(({ id, nombre, cargo, rol, email }) => ({ id, nombre, cargo, rol, email })))
  },
}
