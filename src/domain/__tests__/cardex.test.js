import { describe, it, expect } from 'vitest'
import {
  calcularStock, crearMovimiento, crearReversa, crearReingresoSobrante,
  cantidadReingresable, estaReversado, estadoStock,
} from '../cardex.js'

const base = { usuario_id: 'U-003', fecha: '2026-10-01T10:00:00' }
function ledger() {
  const movs = []
  const push = (r) => { expect(r.ok).toBe(true); movs.push(r.movimiento); return r.movimiento }
  const entrada = push(crearMovimiento(movs, { ...base, tipo: 'ENTRADA_COMPRA', articulo_id: 'A1', cantidad: 10, costo_unitario: 1000 }))
  return { movs, push, entrada }
}

describe('stock derivado', () => {
  it('suma entradas y resta salidas', () => {
    const { movs, push } = ledger()
    push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 4, costo_unitario: 1000, obra_id: 'OB-1' }))
    expect(calcularStock(movs, 'A1')).toBe(6)
    expect(calcularStock(movs, 'A2')).toBe(0)
  })
  it('rechaza stock negativo', () => {
    const { movs } = ledger()
    const r = crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 11, costo_unitario: 1000, obra_id: 'OB-1' })
    expect(r.ok).toBe(false)
  })
  it('exige obra en toda salida y cantidad positiva', () => {
    const { movs } = ledger()
    expect(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 1, costo_unitario: 1 }).ok).toBe(false)
    expect(crearMovimiento(movs, { ...base, tipo: 'ENTRADA_COMPRA', articulo_id: 'A1', cantidad: 0, costo_unitario: 1 }).ok).toBe(false)
  })
})

describe('reversa', () => {
  it('es un contra-asiento único y no modifica el original', () => {
    const { movs, push, entrada } = ledger()
    const copia = { ...entrada }
    const salida = push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 4, costo_unitario: 1000, obra_id: 'OB-1' }))
    const rev = push(crearReversa(movs, salida.id, { ...base, motivo: 'Error de digitación' }))
    expect(rev.signo).toBe(1)
    expect(rev.obra_id).toBe('OB-1')
    expect(calcularStock(movs, 'A1')).toBe(10)
    expect(estaReversado(movs, salida.id)).toBe(true)
    expect(movs[0]).toEqual(copia)
    expect(crearReversa(movs, salida.id, { ...base, motivo: 'Otra vez' }).ok).toBe(false)
  })
  it('exige motivo y no reversa reversas', () => {
    const { movs, push, entrada } = ledger()
    expect(crearReversa(movs, entrada.id, { ...base, motivo: '' }).ok).toBe(false)
    const salida = push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 1, costo_unitario: 1000, obra_id: 'OB-1' }))
    const rev = push(crearReversa(movs, salida.id, { ...base, motivo: 'Motivo válido' }))
    expect(crearReversa(movs, rev.id, { ...base, motivo: 'Motivo válido' }).ok).toBe(false)
  })
  it('no reversa una entrada si deja stock negativo', () => {
    const { movs, push, entrada } = ledger()
    push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 8, costo_unitario: 1000, obra_id: 'OB-1' }))
    expect(crearReversa(movs, entrada.id, { ...base, motivo: 'Factura mal ingresada' }).ok).toBe(false)
  })
})

describe('reingreso de sobrante', () => {
  it('devuelve al stock al costo original y limita a lo no devuelto', () => {
    const { movs, push } = ledger()
    const salida = push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 6, costo_unitario: 1000, obra_id: 'OB-1' }))
    const re = push(crearReingresoSobrante(movs, { ...base, salida_id: salida.id, cantidad: 2 }))
    expect(re.costo_unitario).toBe(1000)
    expect(re.obra_id).toBe('OB-1')
    expect(calcularStock(movs, 'A1')).toBe(6)
    expect(cantidadReingresable(movs, salida.id)).toBe(4)
    expect(crearReingresoSobrante(movs, { ...base, salida_id: salida.id, cantidad: 5 }).ok).toBe(false)
  })
  it('bloquea reversar una salida con reingresos activos', () => {
    const { movs, push } = ledger()
    const salida = push(crearMovimiento(movs, { ...base, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 6, costo_unitario: 1000, obra_id: 'OB-1' }))
    push(crearReingresoSobrante(movs, { ...base, salida_id: salida.id, cantidad: 1 }))
    expect(crearReversa(movs, salida.id, { ...base, motivo: 'Motivo válido' }).ok).toBe(false)
  })
})

describe('estadoStock', () => {
  it('clasifica', () => {
    expect(estadoStock(0, 5)).toBe('SIN_STOCK')
    expect(estadoStock(3, 5)).toBe('BAJO')
    expect(estadoStock(5, 5)).toBe('OK')
  })
})

import { valorInventario } from '../cardex.js'
import { formatFecha, formatFechaHora, conSigno } from '../format.js'

describe('valorInventario / formato', () => {
  it('valoriza stock × costo y devuelve null sin costos visibles', () => {
    expect(valorInventario([{ stock: 2, costo_unitario: 1000 }, { stock: 3, costo_unitario: 500 }])).toBe(3500)
    expect(valorInventario([{ stock: 2 }])).toBeNull()
  })
  it('formatea fechas sin desfase y cantidades con signo', () => {
    expect(formatFecha('2026-10-23T09:05:00')).toBe('23-10-2026')
    expect(formatFechaHora('2026-10-23T09:05:00')).toBe('23-10-2026 09:05')
    expect(conSigno(5)).toBe('+5')
    expect(conSigno(-3)).toBe('−3')
  })
})

import { isoLocal, fechaLocal } from '../format.js'

describe('isoLocal', () => {
  it('usa componentes locales, no UTC', () => {
    const d = new Date(2026, 9, 23, 22, 18, 5)
    expect(isoLocal(d)).toBe('2026-10-23T22:18:05')
    expect(fechaLocal(d)).toBe('2026-10-23')
  })
})

import { formatPct } from '../format.js'
it('formatPct usa coma decimal', () => expect(formatPct(34.5)).toBe('34,5 %'))
