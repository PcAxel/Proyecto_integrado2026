import { describe, it, expect, beforeEach } from 'vitest'
import { entrarComo } from '@/test-support/sesion'
import { db } from '@/mocks/db'
import { configureHttp, solicitudesCompraService, ordenesCompraService, articulosService } from '@/services'
import { ERP_NAV, itemVisible } from '@/layouts/nav'
import { can, PERMISOS } from '@/domain/rbac'

const BODEGA = 'U-003'
const SUPERVISOR = 'U-004'
const FINANZAS = 'U-002'

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  entrarComo(BODEGA)
})

describe('solicitudes de compra', () => {
  it('el Jefe de Bodega solicita y queda PENDIENTE con el solicitante sellado', async () => {
    const [a, b] = await articulosService.list()
    const s = await solicitudesCompraService.create({ items: [{ articulo_id: a.id, cantidad: 5 }, { articulo_id: b.id, cantidad: 2 }], motivo: '  Stock bajo el mínimo ' })
    expect(s).toMatchObject({ id: 'SC-0001', estado: 'PENDIENTE', motivo: 'Stock bajo el mínimo', solicitante_id: BODEGA, orden_ids: [] })
    expect(s.items[0]).toMatchObject({ sku: a.sku, cantidad: 5 })
    expect(s.total_estimado).toBeGreaterThan(0) // Bodega ve el costo de compra
    expect(await solicitudesCompraService.list({ estado: 'PENDIENTE' })).toHaveLength(1)
  })

  it('valida artículos, cantidades y motivo', async () => {
    const [a] = await articulosService.list()
    const ok = { articulo_id: a.id, cantidad: 1 }
    await expect(solicitudesCompraService.create({ items: [], motivo: 'x' })).rejects.toMatchObject({ status: 422 })
    await expect(solicitudesCompraService.create({ items: [ok], motivo: ' ' })).rejects.toMatchObject({ status: 422 })
    await expect(solicitudesCompraService.create({ items: [{ ...ok, cantidad: 0 }], motivo: 'x' })).rejects.toMatchObject({ status: 422 })
    await expect(solicitudesCompraService.create({ items: [ok, ok], motivo: 'x' })).rejects.toMatchObject({ status: 422 })
    await expect(solicitudesCompraService.create({ items: [{ articulo_id: 'ART-999', cantidad: 1 }], motivo: 'x' })).rejects.toMatchObject({ status: 422 })
  })

  it('solo Bodega solicita: Operaciones y Finanzas no', async () => {
    const [a] = await articulosService.list()
    for (const u of [SUPERVISOR, FINANZAS]) {
      entrarComo(u)
      await expect(solicitudesCompraService.create({ items: [{ articulo_id: a.id, cantidad: 1 }], motivo: 'x' })).rejects.toMatchObject({ status: 403 })
    }
  })

  it('las órdenes de compra son de solo lectura desde el cliente', async () => {
    expect(await ordenesCompraService.list()).toEqual([])
    expect(Object.keys(ordenesCompraService)).toEqual(['list'])
  })
})

describe('menú y permisos de Finanzas', () => {
  it('Finanzas ve sus vistas nuevas y solo ella aprueba compras y registra pagos', () => {
    const ve = (rol) => ERP_NAV.filter((i) => itemVisible(i, rol)).map((i) => i.label)
    expect(ve('ADMINISTRACION')).toEqual(expect.arrayContaining(['Aprobación de Compras', 'Cobranzas']))
    expect(ve('BODEGA')).not.toEqual(expect.arrayContaining(['Aprobación de Compras']))
    expect(ve('SUPERVISOR')).not.toEqual(expect.arrayContaining(['Cobranzas']))
    expect(PERMISOS['compras.aprobar']).toEqual(['ADMINISTRACION'])
    expect(PERMISOS['cobranzas.gestionar']).toEqual(['ADMINISTRACION'])
    expect(PERMISOS['solicitudes_compra.crear']).toEqual(['BODEGA'])
    expect(can('ADMIN_GENERAL', 'cobranzas.ver')).toBe(true)
    expect(can('ADMIN_GENERAL', 'cobranzas.gestionar')).toBe(false)
  })
})
