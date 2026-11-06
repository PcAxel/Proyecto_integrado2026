import { describe, it, expect } from 'vitest'
import { causalIndemniza, estadoContractual, pesos, validarArchivo } from '../rrhh.js'

describe('rrhh (presentación)', () => {
  it('solo la causal del art. 161 indemniza', () => {
    expect(causalIndemniza('NECESIDADES_EMPRESA')).toBe(true)
    expect(causalIndemniza('RENUNCIA')).toBe(false)
  })
  it('estado contractual: sin contrato, activo, en curso y finiquitado', () => {
    expect(estadoContractual(null).label).toBe('Sin contrato')
    expect(estadoContractual({ estado: 'ACTIVO', finiquito_id: null }).label).toBe('Activo')
    expect(estadoContractual({ estado: 'ACTIVO', finiquito_id: 3 }).label).toBe('Finiquito en curso')
    expect(estadoContractual({ estado: 'FINIQUITADO' }).label).toBe('Finiquitado')
  })
  it('formatea pesos chilenos', () => {
    expect(pesos('3900000')).toBe('$3.900.000')
    expect(pesos(null)).toBe('$0')
  })
  it('valida extensión y tamaño del archivo', () => {
    const f = (name, size = 10) => ({ name, size })
    expect(validarArchivo(f('a.pdf'), ['pdf'])).toBeNull()
    expect(validarArchivo(f('a.exe'), ['pdf'])).toMatch(/Formato/)
    expect(validarArchivo(f('a.pdf', 11 * 1024 * 1024), ['pdf'])).toMatch(/supera/)
    expect(validarArchivo(null, ['pdf'])).toMatch(/Selecciona/)
  })
})
