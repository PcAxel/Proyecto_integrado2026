import { describe, it, expect } from 'vitest'
import { can, rutaInicial, PERMISOS } from '../rbac.js'

describe('rbac', () => {
  it('Técnico nunca ve costos de compra', () => {
    expect(can('TECNICO', 'costos_compra.ver')).toBe(false)
    expect(can('TECNICO', 'costos.ver')).toBe(false)
  })
  it('Bodega no aprueba presupuestos', () => {
    expect(can('BODEGA', 'presupuestos.aprobar')).toBe(false)
    expect(can('ADMINISTRACION', 'presupuestos.aprobar')).toBe(true)
  })
  it('Bodega puede leer proveedores pero no gestionarlos', () => {
    expect(can('BODEGA', 'proveedores.ver')).toBe(true)
    expect(can('BODEGA', 'maestros.gestionar')).toBe(false)
  })
  it('rol nulo no puede nada', () => {
    expect(can(null, 'dashboard.ver')).toBe(false)
  })
  it('no existe ninguna acción de borrado', () => {
    expect(Object.keys(PERMISOS).some((k) => /eliminar|borrar|delete/i.test(k))).toBe(false)
  })
  it('Técnico aterriza en /app, el resto en /erp', () => {
    expect(rutaInicial('TECNICO')).toBe('/app')
    expect(rutaInicial('BODEGA')).toBe('/erp')
  })
})
