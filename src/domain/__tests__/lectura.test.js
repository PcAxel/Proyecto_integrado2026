import { describe, expect, it } from 'vitest'
import { dividirTexto, elegirVoz, limpiarTexto } from '../lectura'

const voz = (lang, extra = {}) => ({ lang, name: lang, localService: true, ...extra })

describe('elegirVoz', () => {
  it('prefiere es-CL y luego otros acentos latinoamericanos antes que es-ES', () => {
    expect(elegirVoz([voz('en-US'), voz('es-ES'), voz('es-MX'), voz('es-CL')]).lang).toBe('es-CL')
    expect(elegirVoz([voz('es-ES'), voz('es-MX')]).lang).toBe('es-MX')
    expect(elegirVoz([voz('en-US'), voz('es-ES')]).lang).toBe('es-ES')
  })
  it('acepta es_CL con guion bajo y cualquier otro español como último recurso', () => {
    expect(elegirVoz([voz('es_CL')]).lang).toBe('es_CL')
    expect(elegirVoz([voz('es-PE')]).lang).toBe('es-PE')
  })
  it('entre voces del mismo idioma prefiere la local (funciona sin internet)', () => {
    expect(elegirVoz([voz('es-CL', { name: 'remota', localService: false }), voz('es-CL', { name: 'local' })]).name).toBe('local')
  })
  it('respeta un idioma preferido distinto', () => {
    expect(elegirVoz([voz('es-CL'), voz('es-ES')], 'es-ES').lang).toBe('es-ES')
  })
  it('sin voces en español devuelve null', () => {
    expect(elegirVoz([voz('en-US'), voz('fr-FR')])).toBeNull()
    expect(elegirVoz([])).toBeNull()
    expect(elegirVoz(undefined)).toBeNull()
  })
})

describe('limpiarTexto', () => {
  it('normaliza espacios y saltos de línea', () => { expect(limpiarTexto('  Hola \n\n  mundo  ')).toBe('Hola mundo') })
  it('reemplaza viñetas por pausas', () => { expect(limpiarTexto('a • b')).toBe('a , b') })
  it('null y undefined dan vacío', () => { expect([limpiarTexto(null), limpiarTexto(undefined)]).toEqual(['', '']) })
})

describe('dividirTexto', () => {
  it('un texto corto es un solo trozo', () => { expect(dividirTexto('Hola. ¿Cómo estás?')).toEqual(['Hola. ¿Cómo estás?']) })
  it('vacío no da trozos', () => { expect([dividirTexto(''), dividirTexto('   '), dividirTexto(null)]).toEqual([[], [], []]) })
  it('corta al final de una frase y ningún trozo pasa del máximo', () => {
    const texto = Array.from({ length: 12 }, (_, i) => `Esta es la frase número ${i + 1} del texto de prueba.`).join(' ')
    const trozos = dividirTexto(texto, 100)
    expect(trozos.length).toBeGreaterThan(3)
    expect(trozos.every((t) => t.length <= 100)).toBe(true)
    expect(trozos.every((t) => t.endsWith('.'))).toBe(true)
    expect(trozos.join(' ')).toBe(limpiarTexto(texto))  // no se pierde ni se duplica nada
  })
  it('una frase larguísima sin puntos se corta en espacios', () => {
    const texto = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ')
    const trozos = dividirTexto(texto, 80)
    expect(trozos.every((t) => t.length <= 80 && !t.startsWith(' '))).toBe(true)
    expect(trozos.join(' ')).toBe(texto)
  })
  it('una palabra más larga que el máximo no entra en un bucle infinito', () => {
    const trozos = dividirTexto('x'.repeat(500), 100)
    expect(trozos.join('')).toBe('x'.repeat(500))
  })
})
