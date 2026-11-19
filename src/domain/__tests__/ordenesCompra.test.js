import { describe, it, expect } from 'vitest'
import { recibidoPorArticulo, pendientesDeRecibir, itemsDeFacturaDesdeOrden } from '../ordenesCompra'

const orden = { id: 'OC-0001', items: [{ articulo_id: 'ART-1', cantidad: 10, precio_unitario: 100 }, { articulo_id: 'ART-2', cantidad: 5, precio_unitario: 50 }] }
const mov = (articulo_id, cantidad, orden_compra_id, tipo = 'ENTRADA_RECEPCION') => ({ tipo, articulo_id, cantidad, orden_compra_id })

describe('recepciones contra una orden de compra', () => {
  it('suma solo las recepciones enlazadas a esa orden', () => {
    const movs = [mov('ART-1', 4, 'OC-0001'), mov('ART-1', 3, 'OC-0001'), mov('ART-1', 9, 'OC-0002'), mov('ART-1', 9, undefined), mov('ART-2', 2, 'OC-0001', 'ENTRADA_COMPRA')]
    expect(recibidoPorArticulo('OC-0001', movs)).toEqual({ 'ART-1': 7 })
  })
  it('calcula lo que falta recibir y omite lo completo o excedido', () => {
    const movs = [mov('ART-1', 10, 'OC-0001'), mov('ART-2', 2, 'OC-0001')]
    expect(pendientesDeRecibir(orden, movs)).toEqual([{ articulo_id: 'ART-2', pedido: 5, recibido: 2, pendiente: 3 }])
    expect(pendientesDeRecibir(orden, [mov('ART-1', 12, 'OC-0001'), mov('ART-2', 5, 'OC-0001')])).toEqual([])
  })
})

describe('factura desde una orden', () => {
  it('precarga cantidad y precio de la orden', () => {
    expect(itemsDeFacturaDesdeOrden(orden)).toEqual([{ articulo_id: 'ART-1', cantidad: 10, precio_lista: 100 }, { articulo_id: 'ART-2', cantidad: 5, precio_lista: 50 }])
  })
})
