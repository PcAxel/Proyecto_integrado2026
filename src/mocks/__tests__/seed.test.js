import { describe, it, expect } from 'vitest'
import { createSeed } from '../seed.js'
import { calcularStock } from '@/domain/cardex'
import { simularRentabilidad } from '@/domain/rentabilidad'

describe('seed', () => {
  const s = createSeed()
  it('cumple los volúmenes pedidos', () => {
    expect(s.personal).toHaveLength(16)
    expect(s.clientes).toHaveLength(8)
    expect(s.proveedores).toHaveLength(5)
    expect(s.articulos.length).toBeGreaterThanOrEqual(30)
    expect(s.cardex.some((m) => m.tipo === 'REVERSA')).toBe(true)
    expect(s.cardex.some((m) => m.tipo === 'REINGRESO_SOBRANTE')).toBe(true)
    expect(s.obras.filter((o) => o.es_emergencia_sin_presupuesto)).toHaveLength(2)
  })
  it('no deja stock negativo y mantiene un presupuesto en rojo', () => {
    expect(s.articulos.every((a) => calcularStock(s.cardex, a.id) >= 0)).toBe(true)
    const p = s.presupuestos.find((x) => x.estado === 'BORRADOR')
    expect(simularRentabilidad(p).semaforo).toBe('ROJO')
  })
})
