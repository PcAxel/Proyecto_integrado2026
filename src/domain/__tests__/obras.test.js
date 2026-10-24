import { describe, it, expect } from 'vitest'
import { validarCreacionObra, requierePresupuesto, costoRealObra, validarCierreObra, manoObraPorTecnico } from '../obras.js'
import { crearMovimiento, crearReingresoSobrante } from '../cardex.js'

const ctx = { usuario_id: 'U-003', fecha: '2026-10-01T10:00:00' }
const presupuestos = [{ id: 'P1', estado: 'APROBADO' }, { id: 'P2', estado: 'BORRADOR' }]

describe('creación de obra (CU30)', () => {
  it('exige presupuesto para instalación', () => {
    expect(requierePresupuesto('INSTALACION')).toBe(true)
    expect(validarCreacionObra({ tipo: 'INSTALACION' }, presupuestos).ok).toBe(false)
  })
  it('emergencia y garantía abren sin presupuesto con bandera', () => {
    expect(validarCreacionObra({ tipo: 'EMERGENCIA' }, presupuestos)).toEqual({ ok: true, es_emergencia_sin_presupuesto: true })
    expect(validarCreacionObra({ tipo: 'GARANTIA' }, presupuestos).ok).toBe(true)
  })
  it('rechaza presupuesto no aprobado o inexistente', () => {
    expect(validarCreacionObra({ tipo: 'INSTALACION', presupuesto_id: 'P2' }, presupuestos).ok).toBe(false)
    expect(validarCreacionObra({ tipo: 'INSTALACION', presupuesto_id: 'PX' }, presupuestos).ok).toBe(false)
    expect(validarCreacionObra({ tipo: 'INSTALACION', presupuesto_id: 'P1' }, presupuestos).ok).toBe(true)
  })
})

describe('costo real', () => {
  it('suma materiales netos de reingresos y horas-hombre de hojas vigentes', () => {
    const movs = []
    const push = (r) => movs.push(r.movimiento)
    push(crearMovimiento(movs, { ...ctx, tipo: 'ENTRADA_COMPRA', articulo_id: 'A1', cantidad: 20, costo_unitario: 1000 }))
    push(crearMovimiento(movs, { ...ctx, tipo: 'SALIDA_OBRA', articulo_id: 'A1', cantidad: 10, costo_unitario: 1000, obra_id: 'OB-1' }))
    push(crearReingresoSobrante(movs, { ...ctx, salida_id: movs[1].id, cantidad: 3 }))
    const hojas = [
      { obra_id: 'OB-1', estado: 'APROBADA', horas_trabajadas: 4, costo_hora_hombre: 8000 },
      { obra_id: 'OB-1', estado: 'DEVUELTA', horas_trabajadas: 9, costo_hora_hombre: 8000 },
    ]
    expect(costoRealObra('OB-1', movs, hojas)).toEqual({ materiales: 7000, manoObra: 32000, total: 39000 })
  })
})

describe('validarCierreObra', () => {
  const obra = { id: 'OB-1', sobrantes_conciliados: true, presupuesto_id: 'P1' }
  const hojas = [{ obra_id: 'OB-1', estado: 'APROBADA', horas_trabajadas: 5, costo_hora_hombre: 8000 }]
  const ok = { obra, presupuesto: { estado: 'APROBADO' }, hojas, movimientos: [], pendientesSync: 0 }
  it('habilita finalizar cuando los 6 checks pasan', () => {
    const r = validarCierreObra(ok)
    expect(r.checks).toHaveLength(6)
    expect(r.puedeFinalizar).toBe(true)
  })
  it('bloquea con emergencia sin regularizar', () => {
    const r = validarCierreObra({ ...ok, presupuesto: null })
    expect(r.puedeFinalizar).toBe(false)
    expect(r.checks.find((c) => c.id === 'presupuesto').ok).toBe(false)
  })
  it('bloquea con hojas sin aprobar, sync pendiente o sobrantes sin conciliar', () => {
    expect(validarCierreObra({ ...ok, hojas: [{ ...hojas[0], estado: 'ENVIADA' }] }).puedeFinalizar).toBe(false)
    expect(validarCierreObra({ ...ok, pendientesSync: 2 }).puedeFinalizar).toBe(false)
    expect(validarCierreObra({ ...ok, obra: { ...obra, sobrantes_conciliados: false } }).puedeFinalizar).toBe(false)
  })
})

describe('manoObraPorTecnico', () => {
  it('agrupa horas y costo por técnico e ignora hojas devueltas u otras obras', () => {
    const hojas = [
      { obra_id: 'OB-1', tecnico_id: 'T-1', estado: 'APROBADA', horas_trabajadas: 4, costo_hora_hombre: 10000 },
      { obra_id: 'OB-1', tecnico_id: 'T-1', estado: 'ENVIADA', horas_trabajadas: 2, costo_hora_hombre: 10000 },
      { obra_id: 'OB-1', tecnico_id: 'T-2', estado: 'APROBADA', horas_trabajadas: 3, costo_hora_hombre: 7000 },
      { obra_id: 'OB-1', tecnico_id: 'T-2', estado: 'DEVUELTA', horas_trabajadas: 9, costo_hora_hombre: 7000 },
      { obra_id: 'OB-2', tecnico_id: 'T-1', estado: 'APROBADA', horas_trabajadas: 8, costo_hora_hombre: 10000 },
    ]
    expect(manoObraPorTecnico(hojas, 'OB-1')).toEqual([
      { tecnico_id: 'T-1', horas: 6, costo: 60000, hojas: 2 },
      { tecnico_id: 'T-2', horas: 3, costo: 21000, hojas: 1 },
    ])
  })
})
