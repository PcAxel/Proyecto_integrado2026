import { describe, it, expect } from 'vitest'
import { aplicarTecla, aNumero } from '../teclado.js'

const teclear = (...ts) => ts.reduce((v, t) => aplicarTecla(v, t), '')

describe('teclado numérico', () => {
  it('arma números con decimales y evita ceros a la izquierda', () => {
    expect(teclear('1', '2', '.', '5')).toBe('12.5')
    expect(teclear('0', '7')).toBe('7')
    expect(teclear('.', '5')).toBe('0.5')
  })
  it('ignora un segundo punto y limita los dígitos', () => {
    expect(teclear('1', '.', '2', '.')).toBe('1.2')
    expect(teclear('1', '2', '3', '4', '5', '6', '7')).toBe('123456')
  })
  it('alterna el signo y maneja −0', () => {
    expect(teclear('1', '8', '±')).toBe('-18')
    expect(teclear('±', '1', '8', '±')).toBe('18')
    expect(teclear('±', '0', '5')).toBe('-5')
  })
  it('convierte a número solo cuando está completo', () => {
    expect(aNumero('-18')).toBe(-18)
    expect(aNumero('12.5')).toBe(12.5)
    expect(aNumero('12.')).toBeNull()
    expect(aNumero('-')).toBeNull()
    expect(aNumero('')).toBeNull()
  })
})
