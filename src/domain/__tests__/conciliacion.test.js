import { describe, it, expect } from 'vitest'
import { ESTADO_CONCILIACION, TIPO_DISCREPANCIA, estadoDe, describirDiscrepancia, contarPorEstado, motivoLiberacionValido } from '../conciliacion'

const conc = { 'FC-1': { estado: 'BLOQUEADA_POR_DISCREPANCIA' }, 'FC-2': { estado: 'CONCILIADA' }, 'FC-3': { estado: 'CONCILIADA' } }

describe('conciliación de compras', () => {
  it('todos los estados del servidor tienen etiqueta y tono', () => {
    for (const e of ['SIN_ORDEN', 'CONCILIADA', 'PENDIENTE_RECEPCION', 'BLOQUEADA_POR_DISCREPANCIA', 'LIBERADA']) {
      expect(ESTADO_CONCILIACION[e].label).toBeTruthy()
      expect(ESTADO_CONCILIACION[e].tone).toBeTruthy()
    }
    expect(Object.keys(TIPO_DISCREPANCIA)).toEqual(['FALTANTE_DE_ENTREGA', 'SOBRE_PEDIDO', 'ARTICULO_NO_PEDIDO', 'PRECIO_MAYOR'])
  })
  it('lee el estado de una factura y cuenta por estado', () => {
    expect(estadoDe(conc, 'FC-1')).toBe('BLOQUEADA_POR_DISCREPANCIA')
    expect(estadoDe(conc, 'FC-9')).toBeNull()
    expect(estadoDe(null, 'FC-1')).toBeNull()
    expect(contarPorEstado(conc, ['FC-1', 'FC-2', 'FC-3', 'FC-9'])).toEqual({ BLOQUEADA_POR_DISCREPANCIA: 1, CONCILIADA: 2 })
  })
  it('describe una discrepancia en palabras', () => {
    expect(describirDiscrepancia({ tipo: 'FALTANTE_DE_ENTREGA', cantidad: 4, monto_neto: 4000 })).toBe('Faltante de entrega · 4 unid. · $4.000 neto')
    expect(describirDiscrepancia({ tipo: 'PRECIO_MAYOR', cantidad: 5, monto_neto: 100, precio_factura: 120, precio_orden: 100 })).toContain('factura $120 vs orden $100')
  })
  it('el motivo de liberación exige explicar (10 a 300 caracteres)', () => {
    expect(motivoLiberacionValido('ok')).toBe(false)
    expect(motivoLiberacionValido('          corto   ')).toBe(false)
    expect(motivoLiberacionValido('La guía 88 trae las 3 unidades')).toBe(true)
    expect(motivoLiberacionValido('x'.repeat(301))).toBe(false)
  })
})
