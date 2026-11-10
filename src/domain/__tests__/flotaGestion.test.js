import { describe, it, expect } from 'vitest'
import { validarVehiculo, cuerpoVehiculo, validarDocumentoVehiculo, TIPOS_DOCUMENTO_VEHICULO } from '../flotaGestion'
import { esPatenteValida } from '../flota'

const bueno = { patente: 'abcd-12', marca: 'Toyota', modelo: 'Hilux', anio: '2022', tecnico: '', km_inicial: '' }

describe('patente', () => {
  it('acepta el formato antiguo y el vigente, con o sin guion', () => {
    for (const p of ['AB-1234', 'ab1234', 'ABCD-12', 'abcd 12']) expect(esPatenteValida(p)).toBe(true)
  })
  it('rechaza lo que no lo es', () => {
    for (const p of ['', '1234', 'ABC123', 'ABCDE1', 'AB-12345', null]) expect(esPatenteValida(p)).toBe(false)
  })
})

describe('validarVehiculo', () => {
  it('un vehículo completo no tiene errores', () => expect(validarVehiculo(bueno)).toEqual({}))
  it('exige patente válida, marca y modelo', () => {
    expect(Object.keys(validarVehiculo({ ...bueno, patente: 'xx', marca: ' ', modelo: '' })).sort()).toEqual(['marca', 'modelo', 'patente'])
  })
  it('el año debe ser razonable y es opcional', () => {
    expect(validarVehiculo({ ...bueno, anio: '' })).toEqual({})
    expect(validarVehiculo({ ...bueno, anio: '1950' }).anio).toBeDefined()
    expect(validarVehiculo({ ...bueno, anio: String(new Date().getFullYear() + 5) }).anio).toBeDefined()
  })
  it('el kilometraje inicial no puede ser negativo', () => expect(validarVehiculo({ ...bueno, km_inicial: '-5' }).km_inicial).toBeDefined())
})

describe('cuerpoVehiculo', () => {
  it('convierte números y vacíos', () => {
    expect(cuerpoVehiculo({ ...bueno, tecnico: '4', km_inicial: '48250' }, false)).toEqual({ patente: 'abcd-12', marca: 'Toyota', modelo: 'Hilux', anio: 2022, tecnico: 4, km_inicial: 48250 })
    expect(cuerpoVehiculo({ ...bueno, anio: '', tecnico: '' }, false)).toMatchObject({ anio: null, tecnico: null })
  })
  it('al editar nunca envía el kilometraje (solo cambia con una lectura)', () => {
    const c = cuerpoVehiculo({ ...bueno, km_inicial: '999', estado: 'EN_TALLER', activo: true }, true)
    expect(c).not.toHaveProperty('km_inicial')
    expect(c).toMatchObject({ estado: 'EN_TALLER', activo: true })
  })
})

describe('validarDocumentoVehiculo', () => {
  const hoy = '2026-11-10'
  it('exige el vencimiento', () => expect(validarDocumentoVehiculo({ tipo: 'SEGURO', fecha_realizacion: '2026-10-01', fecha_vencimiento: '' }, hoy).fecha_vencimiento).toBeDefined())
  it('no admite que se haya hecho en el futuro ni que venza antes de hacerse', () => {
    expect(validarDocumentoVehiculo({ fecha_realizacion: '2026-12-01', fecha_vencimiento: '2027-12-01' }, hoy).fecha_realizacion).toBeDefined()
    expect(validarDocumentoVehiculo({ fecha_realizacion: '2026-10-01', fecha_vencimiento: '2026-09-01' }, hoy).fecha_vencimiento).toBeDefined()
    expect(validarDocumentoVehiculo({ fecha_realizacion: '2026-10-01', fecha_vencimiento: '2027-10-01' }, hoy)).toEqual({})
  })
  it('permite registrar sin el día en que se hizo', () => expect(validarDocumentoVehiculo({ fecha_realizacion: '', fecha_vencimiento: '2027-10-01' }, hoy)).toEqual({}))
  it('ofrece los tres tipos', () => expect(TIPOS_DOCUMENTO_VEHICULO.map((t) => t.value)).toEqual(['REVISION_TECNICA', 'PERMISO_CIRCULACION', 'SEGURO']))
})
