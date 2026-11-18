import { describe, it, expect } from 'vitest'
import { presentarIva, presentarGanancia, nombreMes, presentarLibroIva, formulaIva } from '../resumenTributario'

describe('presentarIva', () => {
  it('rojo si hay IVA por pagar, verde si queda remanente', () => {
    expect(presentarIva(304000)).toMatchObject({ tono: 'crit', estado: 'A pagar' })
    expect(presentarIva(-760000)).toMatchObject({ tono: 'ok', estado: 'A favor' })
    expect(presentarIva(0).tono).toBe('neutral')
  })
  it('el remanente se muestra en positivo', () => {
    expect(presentarIva(-760000).valor).toBe(presentarIva(760000).valor)
  })
})

describe('presentarGanancia', () => {
  it('pérdida en rojo y ganancia en verde', () => {
    expect(presentarGanancia(1600000, 53.3)).toMatchObject({ tono: 'ok', estado: 'Ganancia del mes' })
    expect(presentarGanancia(-5, null)).toMatchObject({ tono: 'crit', margen: 'Sin ventas en el mes' })
  })
})

describe('nombreMes', () => {
  it('formatea el mes en español', () => {
    expect(nombreMes('2026-11')).toMatch(/noviembre.*2026/)
  })
})

describe('libro de IVA', () => {
  const base = { debito: 380000, credito: 95000, remanente_anterior: 190000, a_pagar: 95000, remanente_siguiente: 0 }
  it('con IVA por pagar es rojo; con remanente es verde; sin saldo es neutro', () => {
    expect(presentarLibroIva(base)).toMatchObject({ tono: 'crit', titulo: 'IVA a pagar', valor: 95000 })
    expect(presentarLibroIva({ ...base, a_pagar: 0, remanente_siguiente: 38000 })).toMatchObject({ tono: 'ok', titulo: 'Remanente a favor', valor: 38000 })
    expect(presentarLibroIva({ ...base, a_pagar: 0 }).tono).toBe('neutral')
  })
  it('la fórmula se puede revisar a mano', () => {
    expect(formulaIva(base)).toContain('=')
    expect(formulaIva(base).endsWith('$95.000 → a pagar')).toBe(true)
    expect(formulaIva({ ...base, remanente_anterior: 1000000 })).toContain('→ remanente a favor')
  })
})
