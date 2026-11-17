import { describe, it, expect } from 'vitest'
import { generarClave, problemaDeClave } from '../claves'

describe('claves temporales', () => {
  it('genera claves largas, distintas y sin caracteres ambiguos', () => {
    const a = generarClave()
    expect(a).toMatch(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/)
    expect(a).not.toMatch(/[lIO01]/)
    expect(generarClave()).not.toBe(a)
    expect(problemaDeClave(a)).toBeNull()
  })
  it('avisa lo evidente antes de enviar y deja que el servidor decida el resto', () => {
    expect(problemaDeClave('')).toBeNull() // vacía = que el servidor genere una
    expect(problemaDeClave('corta')).toMatch(/10 caracteres/)
    expect(problemaDeClave('1234567890')).toMatch(/solo números/)
    expect(problemaDeClave('Clave-Segura-2026')).toBeNull()
  })
})
