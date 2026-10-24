import { describe, it, expect } from 'vitest'
import { haversine, dentroDeGeocerca } from '../geo.js'
import { digitoVerificador, formatRut, validarRut } from '../rut.js'

const chillan = { lat: -36.6066, lng: -72.1034 }

describe('geo', () => {
  it('distancia cero al mismo punto', () => {
    expect(haversine(chillan, chillan)).toBe(0)
  })
  it('Chillán–San Carlos ≈ 25 km', () => {
    const d = haversine(chillan, { lat: -36.4243, lng: -71.9582 })
    expect(d).toBeGreaterThan(22000)
    expect(d).toBeLessThan(28000)
  })
  it('geocerca', () => {
    expect(dentroDeGeocerca({ lat: -36.6067, lng: -72.1035 }, chillan, 150).dentro).toBe(true)
    expect(dentroDeGeocerca({ lat: -36.62, lng: -72.1 }, chillan, 150).dentro).toBe(false)
  })
})

describe('rut', () => {
  it('calcula dígito verificador', () => {
    expect(digitoVerificador(12345678)).toBe('5')
    expect(digitoVerificador(76086428)).toBe('5')
  })
  it('formatea y valida', () => {
    expect(formatRut(12345678)).toBe('12.345.678-5')
    expect(validarRut('12.345.678-5')).toBe(true)
    expect(validarRut('12.345.678-9')).toBe(false)
  })
})
