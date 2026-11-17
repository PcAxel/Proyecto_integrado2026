import { describe, it, expect } from 'vitest'
import { ETAPAS, ETAPA_LABEL, etapaDe, puedeDelegar, puedeAuditar } from '../etapasObra'
import { can, PERMISOS } from '../rbac'
import { ERP_NAV, itemVisible, itemDeRuta } from '@/layouts/nav'
import { rolUiDesdeApi } from '../rolesApi'

describe('etapas del flujo de obra', () => {
  it('las cinco etapas piden etiqueta', () => {
    expect(ETAPAS).toEqual(['CREADO', 'ASIGNADO_A_TERRENO', 'EN_EJECUCION', 'AUDITORIA_TERRENO_OK', 'FACTURADO', 'PAGADA'])
    ETAPAS.forEach((e) => expect(ETAPA_LABEL[e]).toBeTruthy())
  })
  it('una obra anterior al flujo deduce su etapa del estado', () => {
    expect(etapaDe({ estado: 'PLANIFICADA' })).toBe('CREADO')
    expect(etapaDe({ estado: 'EN_CURSO' })).toBe('EN_EJECUCION')
    expect(etapaDe({ estado: 'FINALIZADA' })).toBe('AUDITORIA_TERRENO_OK')
    expect(etapaDe({ estado: 'EN_CURSO', etapa: 'ASIGNADO_A_TERRENO' })).toBe('ASIGNADO_A_TERRENO')
    expect(etapaDe({ estado: 'EN_CURSO', etapa: 'inventada' })).toBe('EN_EJECUCION')
  })
  it('delegar: mientras no esté finalizada; auditar: en curso y ya delegada', () => {
    expect(puedeDelegar({ estado: 'PLANIFICADA' })).toBe(true)
    expect(puedeDelegar({ estado: 'FINALIZADA' })).toBe(false)
    expect(puedeAuditar({ estado: 'PLANIFICADA', etapa: 'CREADO' })).toBe(false)
    expect(puedeAuditar({ estado: 'EN_CURSO', etapa: 'ASIGNADO_A_TERRENO' })).toBe(true)
    expect(puedeAuditar({ estado: 'EN_CURSO' })).toBe(true)
    expect(puedeAuditar({ estado: 'FINALIZADA', etapa: 'AUDITORIA_TERRENO_OK' })).toBe(false)
  })
})

describe('Operaciones y Bodega son roles separados', () => {
  it('el rol del servidor JEFE_BODEGA es Bodega y OPERACIONES es Supervisor', () => {
    expect(rolUiDesdeApi('JEFE_BODEGA')).toBe('BODEGA')
    expect(rolUiDesdeApi('OPERACIONES')).toBe('SUPERVISOR')
  })
  it('solo Bodega opera el inventario', () => {
    for (const a of ['articulos.gestionar', 'cardex.crear', 'bodega.recepcionar', 'cardex.reversar', 'cardex.reingresar', 'conteo.registrar', 'compras.registrar']) {
      expect(PERMISOS[a]).not.toContain('SUPERVISOR')
    }
    expect(can('BODEGA', 'cardex.crear')).toBe(true)
    expect(can('BODEGA', 'obras.delegar')).toBe(false)
  })
  it('solo el Jefe de Operaciones delega a terreno y audita (el cierre lo comparte con la Gerencia)', () => {
    expect(PERMISOS['obras.delegar']).toEqual(['SUPERVISOR'])
    expect(can('BODEGA', 'obras.cerrar')).toBe(false)
    expect(can('ADMINISTRACION', 'obras.delegar')).toBe(false)
  })
  it('el menú: Operaciones no ve «Bodega y Cardex» y Bodega solo ve lo suyo', () => {
    const ve = (rol) => ERP_NAV.filter((i) => itemVisible(i, rol)).map((i) => i.label)
    expect(ve('SUPERVISOR')).not.toContain('Bodega y Cardex')
    expect(ve('SUPERVISOR')).toEqual(expect.arrayContaining(['Obras', 'Auditoría de Terreno']))
    expect(ve('BODEGA')).toContain('Bodega y Cardex')
    expect(ve('BODEGA')).not.toContain('Obras')
    expect(ve('BODEGA')).not.toContain('Auditoría de Terreno')
  })
  it('Finanzas ve estrictamente su área: sin Bodega, Auditoría de Terreno, Log de Auditoría ni Personal', () => {
    const ve = (rol) => ERP_NAV.filter((i) => itemVisible(i, rol)).map((i) => i.label)
    const finanzas = ve('ADMINISTRACION')
    expect(finanzas).toEqual(expect.arrayContaining(['Presupuestos', 'Obras', 'Compras', 'Finiquitos por Pagar', 'Clientes y Proveedores']))
    for (const oculto of ['Bodega y Cardex', 'Auditoría de Terreno', 'Log de Auditoría', 'Personal y Flota']) expect(finanzas).not.toContain(oculto)
  })
  it('una ruta oculta por el menú tampoco se abre por URL', () => {
    expect(itemDeRuta('/erp/bodega')?.label).toBe('Bodega y Cardex')
    expect(itemDeRuta('/erp/obras/OB-0001')?.label).toBe('Obras')
    expect(itemDeRuta('/erp')?.label).toBe('Inicio')
    expect(itemDeRuta('/erp/inexistente')).toBeUndefined()
    expect(itemVisible(itemDeRuta('/erp/terreno'), 'ADMINISTRACION')).toBe(false)
    expect(itemVisible(itemDeRuta('/erp/auditoria'), 'ADMINISTRACION')).toBe(false)
    expect(itemVisible(itemDeRuta('/erp/terreno'), 'SUPERVISOR')).toBe(true)
  })
  it('Gerencia General: sin TI ni operaciones, con gestión, personas y auditoría', () => {
    const ve = (rol) => ERP_NAV.filter((i) => itemVisible(i, rol)).map((i) => i.label)
    const gerencia = ve('ADMIN_GENERAL')
    for (const oculto of ['Accesos y Usuarios', 'Gobernanza IA', 'Bodega y Cardex', 'Auditoría de Terreno']) expect(gerencia).not.toContain(oculto)
    expect(gerencia).toEqual(expect.arrayContaining([
      'Inicio', 'Presupuestos', 'Obras', 'Compras', 'Cobranzas',
      'Personal y Flota', 'Contratos y Finiquitos', 'Cumplimiento y Rotación', 'Finiquitos por Pagar', 'Clientes y Proveedores', 'Log de Auditoría',
    ]))
    // esas pantallas siguen siendo de TI (Super Admin), que las ve
    expect(ve('SUPER_ADMIN')).toEqual(expect.arrayContaining(['Accesos y Usuarios', 'Gobernanza IA']))
    // y tampoco se abren escribiendo la dirección
    for (const ruta of ['/erp/usuarios', '/erp/gobernanza-ia', '/erp/bodega', '/erp/terreno']) expect(itemVisible(itemDeRuta(ruta), 'ADMIN_GENERAL')).toBe(false)
    for (const ruta of ['/erp/cobranzas', '/erp/auditoria', '/erp/rrhh', '/erp/obras/OB-0001']) expect(itemVisible(itemDeRuta(ruta), 'ADMIN_GENERAL')).toBe(true)
  })
})
