import { describe, expect, it } from 'vitest'
import { ESTADO_SII, mensajeErrorEmision, modoPanel } from '../facturacion'
import { can } from '../rbac'

describe('modoPanel', () => {
  it('sin datos todavía está cargando', () => { expect(modoPanel(null, false)).toBe('cargando') })
  it('mientras se emite siempre muestra «procesando» (aunque el servidor aún diga otra cosa)', () => {
    expect(modoPanel({ estado_sii: 'NO_EMITIDO', emitible: true }, true)).toBe('procesando')
    expect(modoPanel(null, true)).toBe('procesando')
  })
  it('no emitido y emitible → botón de emitir; no emitible → bloqueado con motivo', () => {
    expect(modoPanel({ estado_sii: 'NO_EMITIDO', emitible: true }, false)).toBe('emitir')
    expect(modoPanel({ estado_sii: 'NO_EMITIDO', emitible: false }, false)).toBe('bloqueado')
  })
  it('aceptado → verde con PDF', () => { expect(modoPanel({ estado_sii: 'ACEPTADO', emitible: false }, false)).toBe('aceptado') })
  it('rechazado permite reintentar', () => { expect(modoPanel({ estado_sii: 'RECHAZADO', emitible: true }, false)).toBe('rechazado') })
  it('un «procesando» vigente de otra persona no se puede emitir de nuevo', () => { expect(modoPanel({ estado_sii: 'PROCESANDO', emitible: false }, false)).toBe('procesando') })
})

describe('ESTADO_SII', () => {
  it('tiene los cuatro estados con un tipo de StatusBadge', () => {
    expect(Object.keys(ESTADO_SII)).toEqual(['NO_EMITIDO', 'PROCESANDO', 'ACEPTADO', 'RECHAZADO'])
    expect(ESTADO_SII.ACEPTADO).toEqual({ label: 'Aceptado', type: 'success' })
    expect(ESTADO_SII.RECHAZADO.type).toBe('critical')
  })
})

describe('mensajeErrorEmision', () => {
  it('un mensaje por tipo de error', () => {
    expect(mensajeErrorEmision({ status: 403 })).toContain('rol')
    expect(mensajeErrorEmision({ status: 0 })).toContain('conexión')
    expect(mensajeErrorEmision({ status: 409, message: 'Ya emitida.' })).toBe('Ya emitida.')
    expect(mensajeErrorEmision({ status: 502 })).toContain('SII')
    expect(mensajeErrorEmision(undefined)).toBe('No se pudo emitir la factura.')
  })
})

describe('permiso de facturación', () => {
  it('solo el Administrador y Finanzas pueden emitir', () => {
    expect(['ADMIN_GENERAL', 'ADMINISTRACION'].every((r) => can(r, 'facturacion.emitir'))).toBe(true)
    expect(['BODEGA', 'SUPERVISOR', 'TECNICO', 'CONSULTA', 'RRHH', null, undefined].some((r) => can(r, 'facturacion.emitir'))).toBe(false)
  })
})
