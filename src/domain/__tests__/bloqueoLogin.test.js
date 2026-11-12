import { describe, expect, it } from 'vitest'
import { formatoEspera, resumenFallo, textoRestantes } from '../bloqueoLogin'

describe('formatoEspera', () => {
  it('formatea segundos y minutos', () => {
    expect([5, 59, 60, 90, 300, 3600].map(formatoEspera)).toEqual(['5 s', '59 s', '1 min', '1 min 30 s', '5 min', '60 min'])
  })
  it('valores raros no rompen', () => { expect([formatoEspera(-3), formatoEspera(undefined), formatoEspera(4.2)]).toEqual(['0 s', '0 s', '5 s']) })
})

describe('resumenFallo', () => {
  it('oficina: muestra intentos que quedan y sugiere recuperar desde el 3.º', () => {
    expect(resumenFallo({ intentos_restantes: 2, espera_segundos: 30, sugerir_recuperar: true })).toEqual({ bloqueada: false, restantes: 2, oficina: true, sugerirRecuperar: true, espera: 30 })
  })
  it('terreno: no hay tope de intentos', () => {
    expect(resumenFallo({ intentos_restantes: null, espera_segundos: 300, sugerir_recuperar: true })).toMatchObject({ oficina: false, restantes: null, espera: 300 })
  })
  it('cuenta bloqueada: no se ofrece recuperar (la devuelve el administrador)', () => {
    expect(resumenFallo({ code: 'account_locked', sugerir_recuperar: true })).toMatchObject({ bloqueada: true, sugerirRecuperar: false })
  })
  it('sin datos (error de red, límite por IP) no inventa nada', () => { expect(resumenFallo(null)).toBeNull() })
})

describe('textoRestantes', () => { it('singular y plural', () => { expect([textoRestantes(1), textoRestantes(2)]).toEqual(['Te queda 1 intento.', 'Te quedan 2 intentos.']) }) })
