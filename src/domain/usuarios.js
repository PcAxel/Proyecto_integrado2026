import { ROLES } from './rbac.js'
import { validarRut, normalizarRut } from './rut.js'

export const MIN_PASSWORD = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** @param {string} p @returns {{ok:boolean, error?:string}} */
export function validarPassword(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) return { ok: false, error: `Mínimo ${MIN_PASSWORD} caracteres.` }
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return { ok: false, error: 'Debe combinar letras y números.' }
  return { ok: true }
}

/**
 * Contraseña inicial legible y sin caracteres ambiguos (sin 0/O, 1/l/I). Cumple la política por construcción.
 * @param {() => number} [azar] inyectable para pruebas
 */
export function generarPasswordInicial(azar = Math.random) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const digitos = '23456789'
  const pick = (set) => set[Math.floor(azar() * set.length)]
  const cuerpo = Array.from({ length: 6 }, () => pick(letras)).join('')
  return `${cuerpo}-${pick(digitos)}${pick(digitos)}${pick(digitos)}`
}

/** "Camila Torres" → "CT". @param {string} nombre */
export const iniciales = (nombre) => nombre.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const mismoCorreo = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Valida el alta de un acceso. Devuelve un mensaje por campo para mostrarlo junto al input.
 * @param {{nombre:string, rut:string, cargo:string, rol:string, email:string, password:string}} d
 * @param {Array<{rut:string, email:string}>} existentes
 * @returns {{ok:boolean, errores:Record<string,string>, datos:object}} `datos` ya normalizados
 */
export function validarNuevoUsuario(d, existentes) {
  const errores = {}
  const nombre = (d.nombre ?? '').trim().replace(/\s+/g, ' ')
  const cargo = (d.cargo ?? '').trim()
  const email = (d.email ?? '').trim().toLowerCase()
  const rut = normalizarRut(d.rut ?? '')

  if (nombre.length < 3 || !nombre.includes(' ')) errores.nombre = 'Ingresa nombre y apellido.'
  if (!validarRut(rut)) errores.rut = 'RUT inválido (revisa el dígito verificador).'
  else if (existentes.some((u) => u.rut === rut)) errores.rut = 'Ya existe un usuario con ese RUT.'
  if (cargo.length < 3) errores.cargo = 'Indica el cargo.'
  if (!Object.values(ROLES).includes(d.rol)) errores.rol = 'Selecciona un rol.'
  if (!EMAIL.test(email)) errores.email = 'Correo inválido.'
  else if (existentes.some((u) => mismoCorreo(u.email, email))) errores.email = 'Ya existe un usuario con ese correo.'
  const pw = validarPassword(d.password)
  if (!pw.ok) errores.password = pw.error

  return { ok: Object.keys(errores).length === 0, errores, datos: { nombre, rut, cargo, rol: d.rol, email } }
}

/** @param {Array<{id:string, rol:string, activo:boolean}>} usuarios */
const adminsActivos = (usuarios) => usuarios.filter((u) => u.rol === ROLES.ADMIN_GENERAL && u.activo)

/**
 * Evita que la Gerencia se quede sin acceso: no puede desactivarse a sí misma
 * ni desactivar al último Administrador General activo.
 * @returns {{ok:boolean, motivo?:string}}
 */
export function puedeCambiarEstado({ objetivo, activo, usuarios, actorId }) {
  if (activo) return { ok: true }
  if (objetivo.id === actorId) return { ok: false, motivo: 'No puedes desactivar tu propio acceso.' }
  if (objetivo.rol === ROLES.ADMIN_GENERAL && adminsActivos(usuarios).length <= 1) {
    return { ok: false, motivo: 'Debe quedar al menos un Administrador General activo.' }
  }
  return { ok: true }
}

/**
 * Reglas de edición: campos válidos y protección del último administrador.
 * @param {{nombre?:string, cargo?:string, rol?:string, email?:string}} cambios
 * @returns {{ok:boolean, errores:Record<string,string>, datos:object}}
 */
export function validarEdicionUsuario(cambios, { actual, usuarios, actorId }) {
  const errores = {}
  const datos = {}
  if (cambios.nombre !== undefined) {
    datos.nombre = cambios.nombre.trim().replace(/\s+/g, ' ')
    if (datos.nombre.length < 3 || !datos.nombre.includes(' ')) errores.nombre = 'Ingresa nombre y apellido.'
  }
  if (cambios.cargo !== undefined) {
    datos.cargo = cambios.cargo.trim()
    if (datos.cargo.length < 3) errores.cargo = 'Indica el cargo.'
  }
  if (cambios.email !== undefined) {
    datos.email = cambios.email.trim().toLowerCase()
    if (!EMAIL.test(datos.email)) errores.email = 'Correo inválido.'
    else if (usuarios.some((u) => u.id !== actual.id && mismoCorreo(u.email, datos.email))) errores.email = 'Ya existe un usuario con ese correo.'
  }
  if (cambios.rol !== undefined && cambios.rol !== actual.rol) {
    datos.rol = cambios.rol
    if (!Object.values(ROLES).includes(cambios.rol)) errores.rol = 'Selecciona un rol.'
    else if (actual.id === actorId) errores.rol = 'No puedes cambiar tu propio rol.'
    else if (actual.rol === ROLES.ADMIN_GENERAL && adminsActivos(usuarios).length <= 1) errores.rol = 'Debe quedar al menos un Administrador General activo.'
  }
  return { ok: Object.keys(errores).length === 0, errores, datos }
}
