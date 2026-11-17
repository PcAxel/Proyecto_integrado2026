import { describe, expect, it } from 'vitest'
import { componerDictado, constructorDictado, mensajeErrorDictado } from '../dictado'

describe('componerDictado', () => {
  it('une lo escrito, lo reconocido y lo que se está diciendo, con un solo espacio', () => {
    expect(componerDictado('Hola', 'quiero ver', 'las obras')).toBe('Hola quiero ver las obras')
    expect(componerDictado('', 'llévame a bodega', '')).toBe('llévame a bodega')
  })
  it('no duplica espacios ni deja bordes sueltos', () => {
    expect(componerDictado('  Hola  ', ' mundo ', '  ')).toBe('Hola mundo')
    expect(componerDictado(undefined, null, undefined)).toBe('')
  })
})

describe('constructorDictado', () => {
  it('usa el estándar o la versión con prefijo de Chrome/Safari', () => {
    class A {} ; class B {}
    expect(constructorDictado({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A)
    expect(constructorDictado({ webkitSpeechRecognition: B })).toBe(B)
  })
  it('sin soporte devuelve null', () => { expect(constructorDictado({})).toBeNull(); expect(constructorDictado(undefined)).toBeNull() })
})

describe('mensajeErrorDictado', () => {
  it('explica los errores que la persona puede arreglar', () => {
    expect(mensajeErrorDictado('not-allowed')).toContain('permite el micrófono')
    expect(mensajeErrorDictado('audio-capture')).toContain('micrófono')
    expect(mensajeErrorDictado('network')).toContain('internet')
  })
  it('el silencio y el corte voluntario no muestran error', () => {
    expect(mensajeErrorDictado('no-speech')).toBeNull()
    expect(mensajeErrorDictado('aborted')).toBeNull()
  })
  it('cualquier otro error da un mensaje genérico', () => { expect(mensajeErrorDictado('algo-raro')).toContain('escribir') })
})
