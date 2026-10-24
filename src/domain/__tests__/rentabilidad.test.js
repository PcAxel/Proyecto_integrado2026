import { describe, it, expect } from 'vitest'
import { simularRentabilidad, puedeAprobarPresupuesto, precioParaMargen, margenReal, compararCostos, promedioTarifasPorCargo, semaforoMargen } from '../rentabilidad.js'

const base = {
  materiales: [{ cantidad: 2, costo_unitario: 100000 }],
  mano_obra: [{ horas: 10, costo_hora_hombre: 8000 }],
  adicionales: [{ monto: 20000 }],
}

describe('simularRentabilidad', () => {
  it('calcula costos, IVA y margen', () => {
    const r = simularRentabilidad({ ...base, precio_venta_neto: 500000 })
    expect(r.costoTotal).toBe(300000)
    expect(r.iva).toBe(95000)
    expect(r.ventaTotal).toBe(595000)
    expect(r.margenPct).toBe(40)
    expect(r.semaforo).toBe('VERDE')
  })
  it('semáforo rojo bajo 20 %', () => {
    const r = simularRentabilidad({ ...base, precio_venta_neto: 350000 })
    expect(r.margenPct).toBeCloseTo(14.3, 1)
    expect(r.semaforo).toBe('ROJO')
    expect(r.bajoMinimo).toBe(true)
  })
  it('venta cero no divide por cero', () => {
    const r = simularRentabilidad({ ...base, precio_venta_neto: 0 })
    expect(r.margenPct).toBe(0)
    expect(r.semaforo).toBe('ROJO')
  })
  it('el precio sugerido alcanza el margen objetivo', () => {
    const p = precioParaMargen(300000, 25)
    expect(p).toBe(400000)
    expect(simularRentabilidad({ ...base, precio_venta_neto: p }).margenPct).toBeGreaterThanOrEqual(25)
  })
})

describe('puedeAprobarPresupuesto', () => {
  it('bloquea a Administración con margen < 20 % pero no a Gerencia', () => {
    const roja = { bajoMinimo: true }
    expect(puedeAprobarPresupuesto('ADMINISTRACION', roja).ok).toBe(false)
    expect(puedeAprobarPresupuesto('ADMIN_GENERAL', roja).ok).toBe(true)
  })
  it('Bodega nunca aprueba', () => {
    expect(puedeAprobarPresupuesto('BODEGA', { bajoMinimo: false }).ok).toBe(false)
  })
})

describe('costos reales', () => {
  it('margen real y semáforo', () => {
    expect(margenReal(1000000, 700000)).toEqual({ margenMonto: 300000, margenPct: 30, semaforo: 'VERDE' })
    expect(margenReal(0, 5).semaforo).toBe('ROJO')
    expect(semaforoMargen(25)).toBe('AMBAR')
  })
  it('compara presupuestado vs real con tolerancia de ±5 %', () => {
    expect(compararCostos(100000, 103000).estado).toBe('EN_RANGO')
    expect(compararCostos(100000, 120000)).toEqual({ desvioMonto: 20000, desvioPct: 20, estado: 'SOBRECOSTO' })
    expect(compararCostos(100000, 80000).estado).toBe('BAJO_PRESUPUESTO')
  })
  it('promedia tarifas por cargo ignorando inactivos', () => {
    const r = promedioTarifasPorCargo([
      { cargo: 'A', costo_hora_hombre: 10000 }, { cargo: 'A', costo_hora_hombre: 12000 },
      { cargo: 'B', costo_hora_hombre: 7000 }, { cargo: 'B', costo_hora_hombre: 99999, activo: false },
    ])
    expect(r).toEqual([{ cargo: 'A', tarifa: 11000, cantidad: 2 }, { cargo: 'B', tarifa: 7000, cantidad: 1 }])
  })
})
