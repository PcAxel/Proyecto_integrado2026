import { describe, it, expect } from 'vitest'
import { estadoUbicacion, pasosParaReactivar } from '../permisoUbicacion'

describe('permiso de ubicación', () => {
  it('traduce el estado del navegador', () => {
    expect(estadoUbicacion('granted')).toBe('concedido')
    expect(estadoUbicacion('denied')).toBe('denegado')
    expect(estadoUbicacion('prompt')).toBe('pendiente')
    expect(estadoUbicacion(undefined)).toBe('pendiente') // navegador que no permite consultar
  })
  it('las instrucciones de iPhone van por Ajustes y Localización', () => {
    const p = pasosParaReactivar('ios', true).join(' ')
    expect(p).toMatch(/Ajustes/)
    expect(p).toMatch(/Localización/)
    expect(p).toMatch(/Busca «FYAG»/)  // instalada: aparece como app propia
    expect(pasosParaReactivar('ios', false).join(' ')).not.toMatch(/Busca «FYAG»/)  // en Safari: se busca Safari
  })
  it('Android y otros tienen su propia guía y siempre terminan en «Revisar de nuevo»', () => {
    for (const os of ['ios', 'android', 'otro']) expect(pasosParaReactivar(os).at(-1)).toMatch(/Revisar de nuevo/)
    expect(pasosParaReactivar('android').join(' ')).toMatch(/Permisos/)
  })
})
