import { describe, it, expect, beforeEach } from 'vitest'
import { entrarComo } from '@/test-support/sesion'
import { db } from '@/mocks/db'
import { calcularStock } from '@/domain/cardex'
import { configureHttp, conteosService, lotesService, cardexService, articulosService, comprasService } from '@/services'

const BODEGA = 'U-003'
const ADMINISTRACION = 'U-002'
const SUPERVISOR = 'U-004'
const TECNICO = 'U-005'

beforeEach(async () => {
  configureHttp({ minMs: 0, maxMs: 0, failRate: 0 })
  await db.reset()
  entrarComo(BODEGA)
})

const articulo = async () => (await articulosService.list())[0]
const stock = (a) => calcularStock(db.all('cardex'), a.id)

describe('conteo físico', () => {
  it('un conteo que coincide queda conforme y no toca el Cardex', async () => {
    const a = await articulo()
    const antes = db.all('cardex').length
    const c = await conteosService.registrar({ articulo_id: a.id, contado: stock(a) })
    expect(c).toMatchObject({ estado: 'CONFORME', diferencia: 0 })
    expect(db.all('cardex').length).toBe(antes)
  })

  it('con diferencia exige motivo; queda por aprobar y no cambia el stock hasta que otra persona apruebe', async () => {
    const a = await articulo()
    const s = stock(a)
    await expect(conteosService.registrar({ articulo_id: a.id, contado: s - 2 })).rejects.toMatchObject({ status: 422 })
    const c = await conteosService.registrar({ articulo_id: a.id, contado: s - 2, motivo: 'faltan dos por rotura' })
    expect(c).toMatchObject({ estado: 'PENDIENTE', diferencia: -2, stock_sistema: s })
    expect(stock(a)).toBe(s)

    entrarComo(ADMINISTRACION)
    const ok = await conteosService.aprobar(c.id)
    expect(ok.estado).toBe('APROBADO')
    expect(stock(a)).toBe(s - 2)
    const mov = db.find('cardex', ok.movimiento_id)
    expect(mov).toMatchObject({ tipo: 'AJUSTE_CONTEO', cantidad: 2, signo: -1, referencia: c.id })
  })

  it('quien cuenta no puede aprobar, y Operaciones tampoco aprueba ajustes', async () => {
    const a = await articulo()
    const c = await conteosService.registrar({ articulo_id: a.id, contado: stock(a) + 1, motivo: 'sobra una unidad' })
    await expect(conteosService.aprobar(c.id)).rejects.toMatchObject({ status: 403 })
    entrarComo(SUPERVISOR)
    await expect(conteosService.aprobar(c.id)).rejects.toMatchObject({ status: 403 })
  })

  it('rechazar exige motivo y deja el stock intacto', async () => {
    const a = await articulo()
    const s = stock(a)
    const c = await conteosService.registrar({ articulo_id: a.id, contado: s + 3, motivo: 'sobran tres unidades' })
    entrarComo(ADMINISTRACION)
    await expect(conteosService.rechazar(c.id, '')).rejects.toMatchObject({ status: 422 })
    expect((await conteosService.rechazar(c.id, 'volver a contar')).estado).toBe('RECHAZADO')
    expect(stock(a)).toBe(s)
    await expect(conteosService.aprobar(c.id)).rejects.toMatchObject({ status: 409 })
  })

  it('no se aprueba si el stock cambió desde el conteo', async () => {
    const a = await articulo()
    const c = await conteosService.registrar({ articulo_id: a.id, contado: stock(a) - 1, motivo: 'falta una unidad' })
    await cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001' })
    entrarComo(ADMINISTRACION)
    await expect(conteosService.aprobar(c.id)).rejects.toMatchObject({ status: 409 })
  })

  it('no hay dos conteos pendientes del mismo artículo, y el técnico no cuenta', async () => {
    const a = await articulo()
    await conteosService.registrar({ articulo_id: a.id, contado: stock(a) + 1, motivo: 'sobra una unidad' })
    await expect(conteosService.registrar({ articulo_id: a.id, contado: stock(a) + 2, motivo: 'otra vez' })).rejects.toMatchObject({ status: 409 })
    entrarComo(TECNICO)
    await expect(conteosService.registrar({ articulo_id: a.id, contado: 1 })).rejects.toMatchObject({ status: 403 })
  })
})

describe('lotes y cilindros', () => {
  const comprar = async (cantidad = 6) => {
    const a = await articulo()
    const f = await comprasService.createFactura({ proveedor_id: a.proveedor_id, numero: `T-${cantidad}`, fecha: '2026-11-05', descuentos: [], items: [{ articulo_id: a.id, cantidad, precio_lista: 1000 }] })
    const mov = db.all('cardex').find((m) => m.referencia === f.id)
    return { a, mov }
  }

  it('SERIE crea un QR por unidad con código único; LOTE crea uno solo', async () => {
    const { a, mov } = await comprar(6)
    const unidades = await lotesService.crear({ movimiento_id: mov.id, tipo: 'SERIE', cantidad: 4 })
    expect(unidades).toHaveLength(4)
    expect(new Set(unidades.map((u) => u.codigo)).size).toBe(4)
    expect(unidades[0]).toMatchObject({ cantidad: 1, tipo: 'SERIE', restante: 1 })
    expect(unidades[0].codigo.startsWith(`${a.sku}-L`)).toBe(true)
    const lote = await lotesService.crear({ movimiento_id: mov.id, tipo: 'LOTE', cantidad: 2, codigo_proveedor: 'LOTE-77', vencimiento: '2027-06-01' })
    expect(lote).toHaveLength(1)
    expect(lote[0]).toMatchObject({ cantidad: 2, codigo_proveedor: 'LOTE-77', vencimiento: '2027-06-01' })
  })

  it('no se etiqueta más de lo comprado y las entradas se agotan', async () => {
    const { mov } = await comprar(3)
    await lotesService.crear({ movimiento_id: mov.id, tipo: 'SERIE', cantidad: 3 })
    await expect(lotesService.crear({ movimiento_id: mov.id, tipo: 'SERIE', cantidad: 1 })).rejects.toMatchObject({ status: 422 })
    expect((await lotesService.entradasPorEtiquetar()).some((e) => e.movimiento_id === mov.id)).toBe(false)
  })

  it('una salida por cilindro descuenta ese cilindro y lo deja en cero', async () => {
    const { a, mov } = await comprar(5)
    const [u1, u2] = await lotesService.crear({ movimiento_id: mov.id, tipo: 'SERIE', cantidad: 2 })
    const sal = await cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001', lote_id: u1.id })
    expect(sal.lote_codigo).toBe(u1.codigo)
    const lista = await lotesService.list({ articulo_id: a.id })
    expect(lista.find((l) => l.id === u1.id).restante).toBe(0)
    expect(lista.find((l) => l.id === u2.id).restante).toBe(1)
    await expect(cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 1, obra_id: 'OB-0001', lote_id: u1.id })).rejects.toMatchObject({ status: 422 })
  })

  it('una salida por lote no puede exceder el saldo del lote aunque haya stock general', async () => {
    const { a, mov } = await comprar(6)
    const [lote] = await lotesService.crear({ movimiento_id: mov.id, tipo: 'LOTE', cantidad: 2 })
    await expect(cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: a.id, cantidad: 3, obra_id: 'OB-0001', lote_id: lote.id })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/solo tiene 2/) })
  })

  it('solo Bodega crea lotes', async () => {
    const { mov } = await comprar(2)
    entrarComo(ADMINISTRACION)
    await expect(lotesService.crear({ movimiento_id: mov.id, tipo: 'SERIE', cantidad: 1 })).rejects.toMatchObject({ status: 403 })
  })
})
