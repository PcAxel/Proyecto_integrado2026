import { describe, it, expect } from 'vitest'
import { presentarIva, presentarGanancia, nombreMes } from '../resumenTributario'

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
