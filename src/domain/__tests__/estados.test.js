import { describe, expect, it } from 'vitest'
import { ICONO_ESTADO, TIPOS_ESTADO, etiquetaAccesible, normalizarPrefsAccesibilidad, normalizarTipoEstado } from '../estados'

describe('estados («nunca solo color»)', () => {
  it('crítico y advertencia usan ⚠️, correcto usa ✅ y neutral no lleva ícono', () => {
    expect([ICONO_ESTADO.critical, ICONO_ESTADO.warning, ICONO_ESTADO.success, ICONO_ESTADO.neutral]).toEqual(['⚠️', '⚠️', '✅', null])
  })
  it('todos los tipos tienen definido su ícono', () => { expect(TIPOS_ESTADO.every((t) => t in ICONO_ESTADO)).toBe(true) })
  it('un tipo desconocido se trata como neutral', () => {
    expect([normalizarTipoEstado('rojo'), normalizarTipoEstado(undefined), normalizarTipoEstado('critical')]).toEqual(['neutral', 'neutral', 'critical'])
  })
  it('la etiqueta accesible dice el tipo y el texto', () => {
    expect(etiquetaAccesible('critical', 'Stock Crítico')).toBe('Estado crítico: Stock Crítico')
    expect(etiquetaAccesible('success', ' Aprobado ')).toBe('Estado correcto: Aprobado')
    expect(etiquetaAccesible('warning', 'Bajo mínimo')).toBe('Advertencia: Bajo mínimo')
    expect(etiquetaAccesible('???', 'Borrador')).toBe('Estado: Borrador')
    expect(etiquetaAccesible('neutral', undefined)).toBe('Estado: ')
  })
  it('el modo daltonismo parte apagado y solo acepta true', () => {
    expect(normalizarPrefsAccesibilidad(null)).toEqual({ colorBlindMode: false })
    expect(normalizarPrefsAccesibilidad({ colorBlindMode: true })).toEqual({ colorBlindMode: true })
    expect(normalizarPrefsAccesibilidad({ colorBlindMode: 'true' })).toEqual({ colorBlindMode: false })
  })
})
