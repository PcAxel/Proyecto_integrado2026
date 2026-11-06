import { describe, it, expect } from 'vitest'
import { hayPendientes, tituloDocumento } from '../firma.js'

describe('firma de documentos', () => {
  it('detecta documentos pendientes', () => {
    expect(hayPendientes([{ estado: 'FIRMADO' }, { estado: 'PENDIENTE' }])).toBe(true)
    expect(hayPendientes([{ estado: 'FIRMADO' }])).toBe(false)
    expect(hayPendientes(null)).toBe(false)
  })
  it('arma el título con tipo y nombre', () => {
    expect(tituloDocumento({ tipo_documento: 'ANEXO', titulo: 'Cambio de horario' })).toBe('Anexo · Cambio de horario')
    expect(tituloDocumento({ tipo_documento: 'CONTRATO', titulo: '' })).toBe('Contrato')
  })
})
