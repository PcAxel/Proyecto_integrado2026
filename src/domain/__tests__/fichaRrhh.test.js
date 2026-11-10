import { describe, it, expect } from 'vitest'
import { validarFicha, cuerpoFicha, TIPOS_CONTRATO } from '../rrhh'

const buena = { rut: '12.345.678-5', afp: 'HABITAT', sistema_salud: 'FONASA', isapre: '', tipo_contrato: 'INDEFINIDO', fecha_ingreso: '2026-03-01' }

describe('validarFicha', () => {
  it('una ficha completa no tiene errores', () => expect(validarFicha(buena)).toEqual({}))
  it('acepta el RUT con o sin puntos y guion', () => {
    for (const rut of ['12.345.678-5', '12345678-5', '123456785']) expect(validarFicha({ ...buena, rut }).rut).toBeUndefined()
  })
  it('rechaza un RUT con dígito verificador incorrecto o vacío', () => {
    expect(validarFicha({ ...buena, rut: '12.345.678-9' }).rut).toMatch(/dígito verificador/)
    expect(validarFicha({ ...buena, rut: '' }).rut).toBeDefined()
    expect(validarFicha({ ...buena, rut: 'abc' }).rut).toBeDefined()
  })
  it('exige la isapre solo si el sistema de salud es Isapre', () => {
    expect(validarFicha({ ...buena, sistema_salud: 'ISAPRE', isapre: '' }).isapre).toBeDefined()
    expect(validarFicha({ ...buena, sistema_salud: 'ISAPRE', isapre: 'CONSALUD' })).toEqual({})
    expect(validarFicha({ ...buena, sistema_salud: 'FONASA', isapre: '' }).isapre).toBeUndefined()
  })
  it('exige AFP, sistema de salud, tipo de contrato y fecha de ingreso', () => {
    const e = validarFicha({ rut: '12.345.678-5' })
    expect(Object.keys(e).sort()).toEqual(['afp', 'fecha_ingreso', 'sistema_salud', 'tipo_contrato'])
  })
})

describe('cuerpoFicha', () => {
  it('normaliza el RUT que se envía', () => expect(cuerpoFicha({ ...buena, rut: '123456785' }).rut).toBe('12.345.678-5'))
  it('descarta la isapre si el sistema de salud es Fonasa (aunque quedara un valor de antes)', () => {
    expect(cuerpoFicha({ ...buena, sistema_salud: 'FONASA', isapre: 'CONSALUD' }).isapre).toBe('')
    expect(cuerpoFicha({ ...buena, sistema_salud: 'ISAPRE', isapre: 'CONSALUD' }).isapre).toBe('CONSALUD')
  })
})

describe('tipos de contrato', () => {
  it('coinciden con los del servidor (incluye obra o faena)', () => expect(TIPOS_CONTRATO.map((t) => t.value).sort()).toEqual(['INDEFINIDO', 'OBRA_FAENA', 'PLAZO_FIJO']))
})
