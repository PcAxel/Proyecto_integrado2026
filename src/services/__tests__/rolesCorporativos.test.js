import { entrarComo } from '@/test-support/sesion'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/mocks/db'
import { configureHttp, clientesService, proveedoresService, presupuestosService, dashboardService, auditoriaService, obrasService } from '@/services'
import { ERP_NAV } from '@/layouts/nav'
import { can } from '@/domain/rbac'
import { rolUiDesdeApi, ROLES_ERP, inicioDeRolApi } from '@/domain/rolesApi'

const SUPER_ADMIN = 'U-008'
const COMERCIAL = 'U-009'
const AUDITOR = 'U-006'
const menu = (rol) => ERP_NAV.filter((i) => can(rol, i.accion)).map((i) => i.to)

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
})

describe('roles del servidor → matriz', () => {
  it('cada rol corporativo tiene su rol de matriz y entra al ERP', () => {
    expect(rolUiDesdeApi('SUPERADMIN')).toBe('SUPER_ADMIN')
    expect(rolUiDesdeApi('COMERCIAL')).toBe('COMERCIAL')
    expect(rolUiDesdeApi('AUDITOR')).toBe('CONSULTA')
    expect(ROLES_ERP).toEqual(expect.arrayContaining(['ADMIN', 'FINANZAS', 'OPERACIONES', 'RRHH', 'SUPERADMIN', 'COMERCIAL', 'AUDITOR']))
    expect(ROLES_ERP).not.toContain('TECNICO')
    expect(inicioDeRolApi('AUDITOR')).toBe('/erp')
  })
})

describe('Super Admin (TI y Seguridad)', () => {
  it('su menú es solo inicio, auditoría, accesos, gobernanza de IA y estado del sistema', () => {
    expect(menu('SUPER_ADMIN')).toEqual(['/erp', '/erp/auditoria', '/erp/usuarios', '/erp/gobernanza-ia', '/erp/sistema'])
  })
  it('ve el log de auditoría, pero no datos ni indicadores del negocio', async () => {
    entrarComo(SUPER_ADMIN)
    await expect(auditoriaService.list()).resolves.toBeInstanceOf(Array)
    await expect(presupuestosService.list()).rejects.toMatchObject({ status: 403 })
    await expect(obrasService.list()).rejects.toMatchObject({ status: 403 })
    const r = await dashboardService.resumen()
    expect(r.kpis.ventaAprobada).toBeUndefined()
    expect(r.tareas).toEqual([])
  })
})

describe('Ejecutivo Comercial', () => {
  it('su menú es inicio, presupuestos y clientes', () => {
    expect(menu('COMERCIAL')).toEqual(['/erp', '/erp/presupuestos', '/erp/maestros'])
  })
  it('gestiona clientes, no proveedores', async () => {
    entrarComo(COMERCIAL)
    const c = await clientesService.create({ rut: '12.345.678-5', razon_social: 'Cliente nuevo' })
    expect(c.id).toMatch(/^CLI-/)
    await expect(proveedoresService.list()).rejects.toMatchObject({ status: 403 })
    await expect(proveedoresService.create({ rut: '11.111.111-1', razon_social: 'x' })).rejects.toMatchObject({ status: 403 })
  })
  it('cotiza con el catálogo y las tarifas, pero no aprueba', async () => {
    entrarComo(COMERCIAL)
    expect((await presupuestosService.catalogoMateriales()).length).toBeGreaterThan(0)
    await expect(presupuestosService.tarifas()).resolves.toBeTruthy()
    const enviado = (await presupuestosService.list()).find((p) => p.estado === 'ENVIADO')
    if (enviado) await expect(presupuestosService.aprobar(enviado.id)).rejects.toMatchObject({ status: 403 })
    expect(can('COMERCIAL', 'presupuestos.aprobar')).toBe(false)
  })
})

describe('Auditor Externo', () => {
  it('ve los módulos de gestión y no puede crear nada', async () => {
    entrarComo(AUDITOR)
    expect(menu('CONSULTA')).toEqual(expect.arrayContaining(['/erp/presupuestos', '/erp/compras', '/erp/finanzas', '/erp/auditoria']))
    expect(menu('CONSULTA')).not.toContain('/erp/usuarios')
    await expect(clientesService.create({ rut: '12.345.678-5', razon_social: 'x' })).rejects.toMatchObject({ status: 403 })
  })
})

describe('Cumplimiento laboral y rotación', () => {
  it('lo ven RR. HH., la Gerencia General y el Auditor Externo, y nadie más', () => {
    for (const rol of ['RRHH', 'ADMIN_GENERAL', 'CONSULTA']) expect(menu(rol)).toContain('/erp/cumplimiento')
    for (const rol of ['ADMINISTRACION', 'SUPERVISOR', 'BODEGA', 'COMERCIAL', 'SUPER_ADMIN', 'TECNICO']) expect(menu(rol)).not.toContain('/erp/cumplimiento')
  })
  it('solo RR. HH. renueva contratos: Gerencia y Auditor lo ven en modo lectura', () => {
    expect(can('RRHH', 'rrhh.gestionar')).toBe(true)
    expect(can('ADMIN_GENERAL', 'rrhh.gestionar')).toBe(false)
    expect(can('CONSULTA', 'rrhh.gestionar')).toBe(false)
  })
})
