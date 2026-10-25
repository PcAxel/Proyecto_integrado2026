import { describe, it, expect } from 'vitest'
import { validarKilometraje, kmActualizado, resumenFlota, formatKm, KM_MAX_POR_HOJA } from '../flota.js'
import { borradorVacio, validarPasoHoja, PASOS_HOJA } from '../hojas.js'

describe('validarKilometraje', () => {
  it('sin vehículo no exige kilómetros', () => {
    expect(validarKilometraje({ vehiculo_id: '', km_salida: null, km_regreso: null })).toEqual({ ok: true })
  })
  it('con vehículo exige ambos valores', () => {
    expect(validarKilometraje({ vehiculo_id: 'VH-01', km_salida: null, km_regreso: 100 }).ok).toBe(false)
    expect(validarKilometraje({ vehiculo_id: 'VH-01', km_salida: 100, km_regreso: null }).ok).toBe(false)
  })
  it('el regreso debe ser mayor a la salida (no igual ni menor)', () => {
    const base = { vehiculo_id: 'VH-01', km_salida: 48250 }
    expect(validarKilometraje({ ...base, km_regreso: 48250 }).ok).toBe(false)
    expect(validarKilometraje({ ...base, km_regreso: 48000 }).error).toMatch(/mayor/)
    expect(validarKilometraje({ ...base, km_regreso: 48312 })).toEqual({ ok: true, recorrido: 62 })
  })
  it('rechaza negativos y recorridos absurdos', () => {
    expect(validarKilometraje({ vehiculo_id: 'V', km_salida: -5, km_regreso: 10 }).ok).toBe(false)
    expect(validarKilometraje({ vehiculo_id: 'V', km_salida: 0, km_regreso: KM_MAX_POR_HOJA + 1 }).ok).toBe(false)
    expect(validarKilometraje({ vehiculo_id: 'V', km_salida: 0, km_regreso: KM_MAX_POR_HOJA }).ok).toBe(true)
  })
})

describe('odómetro y flota', () => {
  it('el odómetro nunca retrocede', () => {
    expect(kmActualizado(50000, 50100)).toBe(50100)
    expect(kmActualizado(50000, 49900)).toBe(50000)
  })
  it('formatea y resume', () => {
    expect(formatKm(48250)).toBe('48.250 km')
    expect(formatKm(null)).toBe('—')
    expect(resumenFlota([{ estado: 'ACTIVO', km_actual: 10 }, { estado: 'EN_TALLER', km_actual: 5 }, { estado: 'ACTIVO', km_actual: 99, activo: false }]))
      .toEqual({ vehiculos: 2, operativos: 1, enTaller: 1, kmTotal: 15 })
  })
})

describe('paso "Horas y vehículo" del wizard', () => {
  const ok = { ...borradorVacio('OB-1'), horas_trabajadas: 6 }
  it('mantiene 5 pasos', () => expect(PASOS_HOJA).toHaveLength(5))
  it('el vehículo es opcional', () => expect(validarPasoHoja(3, ok).ok).toBe(true))
  it('con vehículo valida el kilometraje', () => {
    expect(validarPasoHoja(3, { ...ok, vehiculo_id: 'VH-01', km_salida: 100, km_regreso: 90 }).ok).toBe(false)
    expect(validarPasoHoja(3, { ...ok, vehiculo_id: 'VH-01', km_salida: 100, km_regreso: 150 }).ok).toBe(true)
  })
  it('las horas siguen validándose primero', () => {
    expect(validarPasoHoja(3, { ...ok, horas_trabajadas: 0 }).ok).toBe(false)
  })
})
