import { describe, it, expect } from 'vitest'
import { PASOS_HOJA, borradorVacio, validarPasoHoja, primerPasoIncompleto } from '../hojas.js'
import { clasificarErrorSync, resumenCola, nuevoClientId } from '../sync.js'
import { CHECKLIST_SCHEMA, rangoLegible, valorLegible } from '../checklist.js'

const completo = {
  obra_id: 'OB-0001',
  checklist: { presion_psi: 98, amperaje_a: 18, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' },
  fotos: [{ id: 1 }, { id: 2 }],
  horas_trabajadas: 6,
  materiales: [],
  observaciones: '',
  firma: 'data:image/png;base64,xxx',
}

describe('wizard de hoja de servicio', () => {
  it('tiene 5 pasos', () => expect(PASOS_HOJA).toHaveLength(5))
  it('un borrador vacío falla en el paso 0 y uno completo no tiene pasos pendientes', () => {
    expect(primerPasoIncompleto(borradorVacio())).toBe(0)
    expect(primerPasoIncompleto(completo)).toBe(-1)
  })
  it('valida cada paso', () => {
    expect(validarPasoHoja(1, { ...completo, checklist: { presion_psi: 90 } }).ok).toBe(false)
    expect(validarPasoHoja(2, { ...completo, fotos: [{}] }).ok).toBe(false)
    expect(validarPasoHoja(3, { ...completo, horas_trabajadas: 0 }).ok).toBe(false)
    expect(validarPasoHoja(3, { ...completo, horas_trabajadas: 20 }).ok).toBe(false)
    expect(validarPasoHoja(4, { ...completo, firma: null }).ok).toBe(false)
  })
})

describe('cola de sincronización', () => {
  it('reintenta fallos de red/5xx y no los 4xx', () => {
    expect(clasificarErrorSync({ status: 503 })).toBe('REINTENTAR')
    expect(clasificarErrorSync(new Error('sin red'))).toBe('REINTENTAR')
    expect(clasificarErrorSync({ status: 422 })).toBe('RECHAZADO')
    expect(clasificarErrorSync({ status: 403 })).toBe('RECHAZADO')
  })
  it('resume la cola', () => {
    expect(resumenCola([{ estado: 'PENDIENTE', tipo: 'HOJA' }, { estado: 'ERROR', tipo: 'RETIRO' }]))
      .toEqual({ total: 2, pendientes: 1, errores: 1, hojas: 1, retiros: 1 })
  })
  it('genera client ids distintos', () => {
    expect(nuevoClientId(1, 0.1)).not.toBe(nuevoClientId(1, 0.2))
  })
})

describe('textos del checklist', () => {
  it('rango y valor legibles', () => {
    expect(rangoLegible(CHECKLIST_SCHEMA[0])).toBe('60–140 PSI')
    expect(valorLegible(CHECKLIST_SCHEMA[0], 98)).toBe('98 PSI')
    expect(valorLegible(CHECKLIST_SCHEMA[2], 'FUGA_MENOR')).toBe('Fuga menor')
    expect(valorLegible(CHECKLIST_SCHEMA[0], null)).toBe('—')
  })
})
