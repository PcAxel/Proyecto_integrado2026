import { describe, it, expect } from 'vitest'
import { PERMISOS, ROLES } from '../rbac.js'
import { validarPassword, generarPasswordInicial, validarNuevoUsuario, puedeCambiarEstado, validarEdicionUsuario, iniciales } from '../usuarios.js'
import { normalizarRut, validarRut } from '../rut.js'

const existentes = [{ id: 'U-001', rut: '12.345.678-5', email: 'usuario.demo04@apex.demo', rol: 'ADMIN_GENERAL', activo: true }]
const valido = { nombre: 'Contacto Demo 01', rut: '99.900.001-0', cargo: 'Asistente administrativa', rol: 'ADMINISTRACION', email: 'usuario.demo@apex.demo', password: 'Inicial-2026' }

describe('permisos de gestión de accesos (sin área de TI)', () => {
  it('solo el Super Admin (TI) y ADMIN_GENERAL tienen usuarios.ver, usuarios.crear y usuarios.editar', () => {
    for (const a of ['usuarios.ver', 'usuarios.crear', 'usuarios.editar']) expect(PERMISOS[a]).toEqual(['SUPER_ADMIN', 'ADMIN_GENERAL'])
    for (const rol of Object.values(ROLES).filter((r) => !['ADMIN_GENERAL', 'SUPER_ADMIN'].includes(r))) {
      expect(Object.keys(PERMISOS).filter((a) => a.startsWith('usuarios.') && PERMISOS[a].includes(rol))).toEqual([])
    }
  })
})

describe('contraseña inicial', () => {
  it('exige longitud mínima y letras con números', () => {
    expect(validarPassword('corta1').ok).toBe(false)
    expect(validarPassword('sololetrasaqui').ok).toBe(false)
    expect(validarPassword('12345678').ok).toBe(false)
    expect(validarPassword('Fyag2026ok').ok).toBe(true)
  })
  it('la generada siempre cumple la política y evita caracteres ambiguos', () => {
    for (let i = 0; i < 50; i++) {
      const p = generarPasswordInicial()
      expect(validarPassword(p).ok).toBe(true)
      expect(p).not.toMatch(/[0OIl1]/)
    }
  })
})

describe('RUT escrito por el usuario', () => {
  it('se normaliza al formato oficial', () => {
    expect(normalizarRut('999000010')).toBe('99.900.001-0')
    expect(normalizarRut('99900001-0')).toBe('99.900.001-0')
    expect(validarRut(normalizarRut('12345678-5'))).toBe(true)
    expect(normalizarRut('abc')).toBe('abc')
  })
})

describe('validarNuevoUsuario', () => {
  it('acepta un alta correcta y devuelve datos normalizados', () => {
    const r = validarNuevoUsuario({ ...valido, rut: '999000010', email: ' Usuario.Demo@APEX.demo ' }, existentes)
    expect(r.ok).toBe(true)
    expect(r.datos).toMatchObject({ rut: '99.900.001-0', email: 'usuario.demo@apex.demo', nombre: 'Contacto Demo 01' })
    expect(r.datos.password).toBeUndefined()
  })
  it('informa un error por campo', () => {
    const r = validarNuevoUsuario({ nombre: 'Ana', rut: '12.345.678-9', cargo: '', rol: 'INEXISTENTE', email: 'no-es-correo', password: 'x' }, existentes)
    expect(Object.keys(r.errores).sort()).toEqual(['cargo', 'email', 'nombre', 'password', 'rol', 'rut'])
  })
  it('rechaza RUT y correo duplicados (sin distinguir mayúsculas)', () => {
    expect(validarNuevoUsuario({ ...valido, rut: '12.345.678-5' }, existentes).errores.rut).toMatch(/Ya existe/)
    expect(validarNuevoUsuario({ ...valido, email: 'usuario.demo04@apex.demo' }, existentes).errores.email).toMatch(/Ya existe/)
  })
})

describe('protección de la Gerencia', () => {
  const todos = [
    { id: 'U-001', rol: 'ADMIN_GENERAL', activo: true, email: 'a@x.cl' },
    { id: 'U-002', rol: 'ADMINISTRACION', activo: true, email: 'b@x.cl' },
  ]
  it('no permite desactivarse a sí mismo ni al último administrador', () => {
    expect(puedeCambiarEstado({ objetivo: todos[0], activo: false, usuarios: todos, actorId: 'U-001' }).ok).toBe(false)
    expect(puedeCambiarEstado({ objetivo: todos[0], activo: false, usuarios: todos, actorId: 'U-002' }).motivo).toMatch(/al menos un Administrador/)
    expect(puedeCambiarEstado({ objetivo: todos[1], activo: false, usuarios: todos, actorId: 'U-001' }).ok).toBe(true)
    expect(puedeCambiarEstado({ objetivo: todos[0], activo: true, usuarios: todos, actorId: 'U-001' }).ok).toBe(true)
  })
  it('permite desactivar a un administrador si queda otro activo', () => {
    const dos = [...todos, { id: 'U-009', rol: 'ADMIN_GENERAL', activo: true, email: 'c@x.cl' }]
    expect(puedeCambiarEstado({ objetivo: dos[2], activo: false, usuarios: dos, actorId: 'U-001' }).ok).toBe(true)
  })
  it('edición: no cambia el rol propio ni quita el último administrador', () => {
    expect(validarEdicionUsuario({ rol: 'BODEGA' }, { actual: todos[0], usuarios: todos, actorId: 'U-001' }).errores.rol).toMatch(/propio rol/)
    expect(validarEdicionUsuario({ rol: 'BODEGA' }, { actual: todos[0], usuarios: todos, actorId: 'U-002' }).errores.rol).toMatch(/al menos un Administrador/)
    expect(validarEdicionUsuario({ rol: 'BODEGA' }, { actual: todos[1], usuarios: todos, actorId: 'U-001' }).ok).toBe(true)
    expect(validarEdicionUsuario({ email: 'a@x.cl' }, { actual: todos[1], usuarios: todos, actorId: 'U-001' }).errores.email).toMatch(/Ya existe/)
  })
  it('iniciales', () => expect(iniciales('camila torres')).toBe('CT'))
})
