import { describe, it, expect } from 'vitest'
import { rutaPorEstado, redireccionRequerida, terminosAceptados, RUTAS_INSTALAR as R } from '../instalacion'

const sinSesion = { access: null, user: null }
const sinTerminos = { access: 'a', user: { email: 'x@fyag.cl', terms_accepted_at: null } }
const conTerminos = { access: 'a', user: { email: 'x@fyag.cl', terms_accepted_at: '2026-11-05T14:00:00Z' } }

describe('instalación: estado de aceptación → ruta', () => {
  it('terms_accepted_at nulo o ausente no cuenta como aceptado', () => {
    expect(terminosAceptados({ terms_accepted_at: null })).toBe(false)
    expect(terminosAceptados({})).toBe(false)
    expect(terminosAceptados(null)).toBe(false)
    expect(terminosAceptados({ terms_accepted_at: '2026-11-05T14:00:00Z' })).toBe(true)
  })
  it('cada estado tiene su pantalla', () => {
    expect(rutaPorEstado(sinSesion)).toBe(R.login)
    expect(rutaPorEstado(sinTerminos)).toBe(R.terminos)
    expect(rutaPorEstado(conTerminos)).toBe(R.descarga)
  })
  it('sin sesión nada es accesible', () => {
    expect(redireccionRequerida(sinSesion, 'sesion')).toBe(R.login)
    expect(redireccionRequerida(sinSesion, 'terminos')).toBe(R.login)
  })
  it('la descarga está bloqueada hasta aceptar', () => {
    expect(redireccionRequerida(sinTerminos, 'terminos')).toBe(R.terminos)
    expect(redireccionRequerida(sinTerminos, 'sesion')).toBeNull()
  })
  it('con términos aceptados se accede a ambas', () => {
    expect(redireccionRequerida(conTerminos, 'terminos')).toBeNull()
    expect(redireccionRequerida(conTerminos, 'sesion')).toBeNull()
  })
})
