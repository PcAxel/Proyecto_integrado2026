import { describe, it, expect } from 'vitest'
import { partirNumero, textoAnimado } from '../contador.js'

describe('partirNumero', () => {
  it('separa prefijo, número y sufijo en formato chileno', () => {
    expect(partirNumero('$21.657.000')).toMatchObject({ antes: '$', despues: '', valor: 21657000, decimales: 0, agrupado: true })
    expect(partirNumero('458.380 km')).toMatchObject({ valor: 458380, despues: ' km' })
    expect(partirNumero('30,8 %')).toMatchObject({ valor: 30.8, decimales: 1, agrupado: false, despues: ' %' })
    expect(partirNumero('-$10.000')).toMatchObject({ antes: '-$', valor: 10000 }) // el signo viaja en el prefijo
  })
  it('devuelve null si no hay número', () => expect(partirNumero('—')).toBeNull())
})

describe('textoAnimado', () => {
  it('termina exactamente en el texto original', () => {
    for (const t of ['$21.657.000', '30,8 %', '458.380 km', '5', '—']) expect(textoAnimado(t, 1)).toBe(t)
  })
  it('empieza en cero conservando el formato', () => {
    expect(textoAnimado('$21.657.000', 0)).toBe('$0')
    expect(textoAnimado('30,8 %', 0)).toBe('0,0 %')
    expect(textoAnimado('458.380 km', 0)).toBe('0 km')
  })
  it('en el medio agrupa miles y respeta decimales', () => {
    const medio = textoAnimado('$21.657.000', 0.5)
    expect(medio).toMatch(/^\$\d{1,3}(\.\d{3})+$/)
    const v = Number(medio.replace(/\D/g, ''))
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(21657000)
    expect(textoAnimado('30,8 %', 0.5)).toMatch(/^\d+,\d %$/)
  })
  it('es creciente', () => {
    const v = (p) => Number(textoAnimado('$1.000.000', p).replace(/\D/g, ''))
    expect(v(0.2)).toBeLessThan(v(0.5))
    expect(v(0.5)).toBeLessThan(v(0.9))
  })
})
