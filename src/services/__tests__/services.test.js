import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/mocks/db'
import { useAuthStore } from '@/stores/authStore'
import {
  configureHttp, cardexService, articulosService, obrasService, presupuestosService,
  hojasService, comprasService, auditoriaService, personalService, retirosService, proveedoresService, clientesService, dashboardService,
} from '@/services'

const login = (id) => useAuthStore.getState().login(id)
const BODEGA = 'U-003'
const SUPERVISOR = 'U-004'
const ADMIN = 'U-002'
const GERENCIA = 'U-001'
const TECNICO = 'U-005'

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  login(BODEGA)
})

describe('contrato del Cardex (P1)', () => {
  it('expone solo list, retrieve, create, reversar, reingresarSobrante', () => {
    expect(Object.keys(cardexService).sort()).toEqual(['create', 'list', 'reingresarSobrante', 'retrieve', 'reversar'])
  })
  it('ningún servicio expone remove/destroy/delete', () => {
    const all = [cardexService, articulosService, obrasService, presupuestosService, hojasService, comprasService, auditoriaService, personalService]
    all.forEach((s) => expect(Object.keys(s).some((k) => /remove|destroy|delete|eliminar/i.test(k))).toBe(false))
  })
  it('reversa una sola vez y audita', async () => {
    const [ultima] = (await cardexService.list({ tipo: 'SALIDA_OBRA' })).filter((m) => !m.reversado)
    const antes = db.all('cardex').length
    const rev = await cardexService.reversar(ultima.id, 'Despacho duplicado por error')
    expect(rev.tipo).toBe('REVERSA')
    expect(db.all('cardex')).toHaveLength(antes + 1)
    await expect(cardexService.reversar(ultima.id, 'Otra vez más')).rejects.toMatchObject({ status: 422 })
    const logs = await (login(ADMIN), auditoriaService.list({ accion: 'REVERSA' }))
    expect(logs[0]).toMatchObject({ entidad: 'MovimientoCardex', usuario_id: BODEGA, rol: 'BODEGA' })
  })
  it('rechaza salidas que dejan stock negativo', async () => {
    const [a] = await articulosService.list()
    await expect(cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 99999, obra_id: 'OB-0001' }))
      .rejects.toMatchObject({ status: 422 })
  })
})

describe('RBAC en servicios (P5)', () => {
  it('Técnico no ve costos de artículos ni puede usar bodega', async () => {
    login(TECNICO)
    await expect(articulosService.list()).rejects.toMatchObject({ status: 403 })
  })
  it('Bodega no ve costos de hora-hombre en hojas pero sí costos de compra', async () => {
    login(SUPERVISOR)
    const hojas = await hojasService.list()
    expect(hojas.length).toBeGreaterThan(0)
    login(BODEGA)
    expect((await articulosService.list())[0].costo_unitario).toBeGreaterThan(0)
    await expect(hojasService.list()).rejects.toMatchObject({ status: 403 })
  })
  it('Bodega no aprueba presupuestos; Administración no aprueba margen < 20 %', async () => {
    await expect(presupuestosService.aprobar('PRE-0007')).rejects.toMatchObject({ status: 403 })
    login(ADMIN)
    const roja = await presupuestosService.create({ cliente_id: 'CLI-001', titulo: 'Prueba margen bajo', tipo_obra: 'MANTENCION', materiales: [], mano_obra: [], adicionales: [{ descripcion: 'x', monto: 100000 }], precio_venta_neto: 105000 })
    await presupuestosService.enviar(roja.id)
    await expect(presupuestosService.aprobar(roja.id)).rejects.toMatchObject({ status: 403 })
    login(GERENCIA)
    expect((await presupuestosService.aprobar(roja.id)).estado).toBe('APROBADO')
  })
  it('un presupuesto aprobado no se puede modificar', async () => {
    login(ADMIN)
    await expect(presupuestosService.update('PRE-0001', { titulo: 'Cambio' })).rejects.toMatchObject({ status: 409 })
  })
})

describe('obras: CU30 y cierre', () => {
  it('exige presupuesto para instalación y permite emergencia solo a Supervisor/Gerencia', async () => {
    login(SUPERVISOR)
    await expect(obrasService.create({ nombre: 'X', cliente_id: 'CLI-001', tipo: 'INSTALACION' })).rejects.toMatchObject({ status: 422 })
    const o = await obrasService.create({ nombre: 'Falla urgente', cliente_id: 'CLI-001', tipo: 'EMERGENCIA', ubicacion: { lat: -36.6, lng: -72.1, radio_m: 150, comuna: 'Chillán', direccion: 'X' } })
    expect(o.es_emergencia_sin_presupuesto).toBe(true)
    login(ADMIN)
    await expect(obrasService.create({ nombre: 'Y', cliente_id: 'CLI-001', tipo: 'EMERGENCIA' })).rejects.toMatchObject({ status: 403 })
  })
  it('bloquea finalizar una emergencia sin regularizar y permite la obra lista', async () => {
    login(SUPERVISOR)
    await expect(obrasService.finalizar('OB-0004')).rejects.toMatchObject({ status: 422 })
    const ok = await obrasService.finalizar('OB-0007')
    expect(ok.estado).toBe('FINALIZADA')
  })
  it('oculta el costo real a quien no puede verlo', async () => {
    login(BODEGA)
    expect((await obrasService.retrieve('OB-0001')).costo_real).toBeNull()
    login(ADMIN)
    expect((await obrasService.retrieve('OB-0001')).costo_real.total).toBeGreaterThan(0)
  })
})

describe('hojas de servicio', () => {
  it('congela la tarifa hora-hombre al enviar y rechaza checklist incompleto', async () => {
    login(TECNICO)
    const base = { obra_id: 'OB-0001', horas_trabajadas: 3, gps: { lat: -36.6285, lng: -72.1331 } }
    await expect(hojasService.enviar({ ...base, checklist_json: { presion_psi: 90 } })).rejects.toMatchObject({ status: 422 })
    const h = await hojasService.enviar({ ...base, checklist_json: { presion_psi: 90, amperaje_a: 15, fugas: 'SIN_FUGAS', temperatura_c: -18, limpieza: 'OK' } })
    expect(h.estado).toBe('ENVIADA')
    expect(h.costo_hora_hombre).toBeUndefined() // el técnico no ve tarifas
    expect(db.find('hojas', h.id).costo_hora_hombre).toBe(11500)
    expect(h.geocerca.dentro).toBe(true)
  })
  it('devolver exige observaciones y aprobar deja auditoría', async () => {
    login(SUPERVISOR)
    await expect(hojasService.devolver('HS-0006', '')).rejects.toMatchObject({ status: 422 })
    expect((await hojasService.aprobar('HS-0006', 'Conforme')).estado).toBe('APROBADA')
    await expect(hojasService.aprobar('HS-0006')).rejects.toMatchObject({ status: 409 })
  })
})

describe('compras', () => {
  it('3 descuentos en cascada generan entradas valoradas al costo neto', async () => {
    const [a] = (await articulosService.list()).filter((x) => x.proveedor_id === 'PRV-003')
    const stockAntes = a.stock
    const f = await comprasService.createFactura({
      proveedor_id: 'PRV-003', numero: '99001', fecha: '2026-10-23', descuentos: [10, 5, 2],
      items: [{ articulo_id: a.id, cantidad: 10, precio_lista: 10000 }],
    })
    expect(f.neto).toBe(83790) // 100.000 × 0,90 × 0,95 × 0,98
    const mov = db.all('cardex').at(-1)
    expect(mov).toMatchObject({ tipo: 'ENTRADA_COMPRA', costo_unitario: 8379, referencia: f.id })
    expect((await articulosService.retrieve(a.id)).stock).toBe(stockAntes + 10)
    await expect(comprasService.createFactura({ ...f, descuentos: [1, 2, 3, 4], numero: 'x', items: f.items })).rejects.toMatchObject({ status: 422 })
  })
})

describe('solicitudes de retiro', () => {
  const items = [{ articulo_id: 'ART-026', cantidad: 2 }]
  it('el técnico crea solo para obras donde está asignado y sin ver costos', async () => {
    login(TECNICO)
    await expect(retirosService.create({ obra_id: 'OB-0002', items })).rejects.toMatchObject({ status: 403 })
    const r = await retirosService.create({ obra_id: 'OB-0001', items })
    expect(r.estado).toBe('PENDIENTE')
    expect(r.items[0].stock).toBeUndefined()
    expect((await articulosService.catalogo())[0].costo_unitario).toBeUndefined()
  })
  it('Bodega entrega: genera salidas valoradas y no permite resolver dos veces', async () => {
    const antes = db.all('cardex').length
    const r = await retirosService.entregar('SR-0001')
    expect(r.estado).toBe('ENTREGADA')
    expect(db.all('cardex')).toHaveLength(antes + 2)
    expect(db.all('cardex').at(-1)).toMatchObject({ tipo: 'SALIDA_OBRA', obra_id: 'OB-0001', referencia: 'Retiro SR-0001' })
    await expect(retirosService.entregar('SR-0001')).rejects.toMatchObject({ status: 409 })
  })
  it('es todo o nada si falta stock y el rechazo exige motivo', async () => {
    db.patch('retiros', 'SR-0002', { items: [{ articulo_id: 'ART-026', cantidad: 5 }, { articulo_id: 'ART-006', cantidad: 999 }] })
    const antes = db.all('cardex').length
    await expect(retirosService.entregar('SR-0002')).rejects.toMatchObject({ status: 422 })
    expect(db.all('cardex')).toHaveLength(antes)
    await expect(retirosService.rechazar('SR-0002', ' ')).rejects.toMatchObject({ status: 422 })
    expect((await retirosService.rechazar('SR-0002', 'Sin stock')).estado).toBe('RECHAZADA')
  })
})

describe('maestros', () => {
  it('Bodega lee proveedores y clientes; el Técnico ninguno', async () => {
    expect((await proveedoresService.list()).length).toBe(5)
    expect((await clientesService.list()).length).toBe(8)
    login(TECNICO)
    await expect(clientesService.list()).rejects.toMatchObject({ status: 403 })
  })
})

describe('presupuestos y obras (Fase 4)', () => {
  it('el catálogo del editor incluye costos solo para quien crea presupuestos', async () => {
    login(SUPERVISOR)
    expect((await presupuestosService.catalogoMateriales())[0].costo_unitario).toBeGreaterThan(0)
    expect((await presupuestosService.tarifas()).length).toBeGreaterThan(3)
    login(BODEGA)
    await expect(presupuestosService.catalogoMateriales()).rejects.toMatchObject({ status: 403 })
  })
  it('un presupuesto aprobado no puede respaldar dos obras', async () => {
    login(SUPERVISOR)
    await expect(obrasService.create({ nombre: 'Otra', cliente_id: 'CLI-001', tipo: 'INSTALACION', presupuesto_id: 'PRE-0001', ubicacion: { lat: -36.6, lng: -72.1 } }))
      .rejects.toMatchObject({ status: 422 })
  })
  it('regulariza una emergencia con un presupuesto aprobado libre', async () => {
    login(SUPERVISOR)
    const p = await presupuestosService.create({ cliente_id: 'CLI-002', titulo: 'Regularización', tipo_obra: 'EMERGENCIA', adicionales: [{ descripcion: 'x', monto: 100000 }], precio_venta_neto: 200000 })
    await presupuestosService.enviar(p.id)
    login(GERENCIA)
    await presupuestosService.aprobar(p.id)
    login(SUPERVISOR)
    const o = await obrasService.regularizarPresupuesto('OB-0004', p.id)
    expect(o.es_emergencia_sin_presupuesto).toBe(false)
    expect(o.cierre.checks.find((c) => c.id === 'presupuesto').ok).toBe(true)
  })
  it('el historial de la obra reúne obra, hojas y movimientos', async () => {
    login(SUPERVISOR)
    const h = await obrasService.historial('OB-0004')
    expect(h.some((l) => l.accion === 'CREAR_CU30')).toBe(true)
  })
})

describe('dashboard por rol', () => {
  it('Gerencia ve todo; Bodega solo lo suyo; Supervisor no ve el valor del inventario; Técnico no entra', async () => {
    login(GERENCIA)
    const g = await dashboardService.resumen()
    expect(g.kpis.ventaAprobada).toBeGreaterThan(0)
    expect(g.kpis.valorInventario).toBeGreaterThan(0)
    expect(g.comparativo.length).toBeGreaterThan(0)
    expect(g.actividad.length).toBeGreaterThan(0)
    expect(g.alertas.some((a) => a.tipo === 'CU30')).toBe(true)

    login(BODEGA)
    const b = await dashboardService.resumen()
    expect(b.kpis.ventaAprobada).toBeUndefined()
    expect(b.kpis.valorInventario).toBeGreaterThan(0)
    expect(b.comparativo).toBeNull()
    expect(b.actividad).toBeNull()

    login(SUPERVISOR)
    const s = await dashboardService.resumen()
    expect(s.kpis.valorInventario).toBeNull()
    expect(s.kpis.costoRealObrasActivas).toBeGreaterThan(0)

    login(TECNICO)
    await expect(dashboardService.resumen()).rejects.toMatchObject({ status: 403 })
  })
  it('alertas de vencimiento: la camioneta con revisión vencida es crítica', async () => {
    login(ADMIN)
    const a = await personalService.alertas()
    expect(a[0]).toMatchObject({ severidad: 'CRITICA', tipo: 'REVISION_TECNICA' })
    expect((await personalService.listFlota())[0].tecnico_nombre).not.toBe('—')
  })
})
