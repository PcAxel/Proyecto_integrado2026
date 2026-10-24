import { describe, it, expect } from 'vitest'
import { CHECKLIST_SCHEMA, evaluarChecklist } from '../checklist.js'

const conforme = { presion_psi: 100, amperaje_a: 20, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' }

describe('evaluarChecklist', () => {
  it('define exactamente 5 puntos críticos', () => {
    expect(CHECKLIST_SCHEMA).toHaveLength(5)
  })
  it('conforme cuando todo está en rango', () => {
    expect(evaluarChecklist(conforme).resultado).toBe('CONFORME')
  })
  it('incompleto si falta un punto', () => {
    expect(evaluarChecklist({ ...conforme, amperaje_a: null }).resultado).toBe('INCOMPLETO')
  })
  it('alerta ligeramente fuera de rango; crítico muy fuera', () => {
    expect(evaluarChecklist({ ...conforme, presion_psi: 144 }).items[0].estado).toBe('ALERTA')
    expect(evaluarChecklist({ ...conforme, presion_psi: 200 }).resultado).toBe('CRITICO')
  })
  it('una fuga mayor es crítica; limpieza parcial genera observaciones', () => {
    expect(evaluarChecklist({ ...conforme, fugas: 'FUGA_MAYOR' }).resultado).toBe('CRITICO')
    expect(evaluarChecklist({ ...conforme, limpieza: 'PARCIAL' }).resultado).toBe('CON_OBSERVACIONES')
  })
})
