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
  it('RRHH tiene exactamente dashboard, personal, asistencia, contratos y finiquitos', () => {
    const suyas = Object.keys(PERMISOS).filter((a) => PERMISOS[a].includes('RRHH')).sort()
    expect(suyas).toEqual(['asistencia.ver', 'dashboard.ver', 'personal.editar', 'personal.ver', 'rrhh.gestionar', 'rrhh.ver'])
    expect(can('RRHH', 'costos.ver')).toBe(false)
    expect(can('RRHH', 'obras.ver')).toBe(false)
  })
  it('quien genera el finiquito no lo paga y viceversa', () => {
    expect(can('RRHH', 'rrhh.gestionar')).toBe(true)
    expect(can('RRHH', 'finiquitos.pagar')).toBe(false)
    expect(can('RRHH', 'finiquitos.ver')).toBe(false)
    expect(can('ADMINISTRACION', 'finiquitos.pagar')).toBe(true)
    expect(can('ADMINISTRACION', 'rrhh.gestionar')).toBe(false)
    expect(can('ADMINISTRACION', 'rrhh.ver')).toBe(false) // el detalle laboral (amonestaciones) no es de Finanzas
    expect(can('ADMIN_GENERAL', 'rrhh.ver') && can('ADMIN_GENERAL', 'finiquitos.ver')).toBe(true)
    expect(can('ADMIN_GENERAL', 'finiquitos.pagar') || can('ADMIN_GENERAL', 'rrhh.gestionar')).toBe(false)
    expect(can('TECNICO', 'rrhh.ver')).toBe(false)
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
