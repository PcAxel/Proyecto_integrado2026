import { describe, it, expect } from 'vitest'
import { formatCLP, calcularNeto, calcularIVA, desglosarTotal } from '../money.js'

describe('formatCLP', () => {
  it('usa separador de miles con punto y símbolo $', () => {
    expect(formatCLP(1250000)).toBe('$1.250.000')
  })
  it('redondea y tolera valores inválidos', () => {
    expect(formatCLP(1999.6)).toBe('$2.000')
    expect(formatCLP(NaN)).toBe('$0')
    expect(formatCLP(-10000)).toBe('-$10.000')
  })
})

describe('calcularNeto', () => {
  it('sin descuentos devuelve el bruto', () => {
    expect(calcularNeto(100000)).toBe(100000)
  })
  it('aplica descuentos en cascada, no sumados', () => {
    // 100000 × 0,90 × 0,95 × 0,98 = 83.790
    expect(calcularNeto(100000, [10, 5, 2])).toBe(83790)
  })
  it('acota porcentajes fuera de rango', () => {
    expect(calcularNeto(1000, [150])).toBe(0)
    expect(calcularNeto(1000, [-5])).toBe(1000)
  })
})

describe('IVA', () => {
  it('calcula 19 %', () => {
    expect(calcularIVA(100000)).toBe(19000)
  })
  it('desglosa neto, iva y total', () => {
    expect(desglosarTotal(100000)).toEqual({ neto: 100000, iva: 19000, total: 119000 })
  })
})

import { calcularFactura } from '../money.js'

describe('calcularFactura', () => {
  it('encadena 3 descuentos y agrega IVA', () => {
    const r = calcularFactura([{ cantidad: 10, precio_lista: 10000 }], [10, 5, 2])
    expect(r.bruto).toBe(100000)
    expect(r.pasos.map((p) => p.monto)).toEqual([10000, 4500, 1710])
    expect(r.neto).toBe(83790)
    expect(r.iva).toBe(15920)
    expect(r.total).toBe(99710)
    expect(r.descuentoTotal).toBe(16210)
  })
  it('sin descuentos ni ítems', () => {
    expect(calcularFactura([], []).total).toBe(0)
  })
})
