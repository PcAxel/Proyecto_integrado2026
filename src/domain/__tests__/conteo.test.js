import { describe, it, expect } from 'vitest'
import { evaluarConteo, puedeAprobarConteo } from '../conteo'
import { crearAjusteConteo, crearReversa, calcularStock, restanteLote, crearMovimiento, TIPOS_MOV as T } from '../cardex'

const mov = (id, tipo, cantidad, signo, extra = {}) => ({ id, tipo, fecha: '2026-11-05T09:00:00', articulo_id: 'A1', cantidad, costo_unitario: 1000, signo, obra_id: null, usuario_id: 'U-1', referencia: 'x', reversa_de: null, salida_origen_id: null, lote_id: null, ...extra })

describe('conteo físico', () => {
  it('sin diferencia queda conforme y no pide motivo', () => {
    expect(evaluarConteo({ stockSistema: 10, contado: 10, costo: 500 })).toMatchObject({ ok: true, estado: 'CONFORME', diferencia: 0, valor: 0 })
  })
  it('con diferencia exige motivo y calcula su valor', () => {
    expect(evaluarConteo({ stockSistema: 10, contado: 7 })).toMatchObject({ ok: false, diferencia: -3 })
    expect(evaluarConteo({ stockSistema: 10, contado: 7, motivo: 'faltan 3 por rotura', costo: 500 })).toMatchObject({ ok: true, estado: 'PENDIENTE', diferencia: -3, valor: -1500 })
    expect(evaluarConteo({ stockSistema: 2, contado: 2.5, motivo: 'sobrante de rollo', costo: 100 }).diferencia).toBe(0.5)
  })
  it('rechaza cantidades inválidas', () => {
    expect(evaluarConteo({ stockSistema: 10, contado: -1 }).ok).toBe(false)
    expect(evaluarConteo({ stockSistema: 10, contado: NaN }).ok).toBe(false)
  })
  it('quien contó no puede aprobar su propio conteo', () => {
    const c = { estado: 'PENDIENTE', creado_por: 'U-3' }
    expect(puedeAprobarConteo(c, 'U-3')).toBe(false)
    expect(puedeAprobarConteo(c, 'U-2')).toBe(true)
    expect(puedeAprobarConteo({ ...c, estado: 'APROBADO' }, 'U-2')).toBe(false)
  })
})

describe('ajuste por conteo en el Cardex', () => {
  const movs = [mov('MOV-000001', T.ENTRADA_COMPRA, 10, 1)]
  const conteo = { id: 'CNT-0001', articulo_id: 'A1', diferencia: -3, stock_sistema: 10 }
  it('genera el contra-asiento exacto y deja el stock contado', () => {
    const r = crearAjusteConteo(movs, { conteo, costo_unitario: 1000, usuario_id: 'U-2', fecha: '2026-11-05T10:00:00' })
    expect(r.ok).toBe(true)
    expect(r.movimiento).toMatchObject({ tipo: 'AJUSTE_CONTEO', cantidad: 3, signo: -1, referencia: 'CNT-0001' })
    expect(calcularStock([...movs, r.movimiento], 'A1')).toBe(7)
  })
  it('si el stock cambió desde el conteo, hay que recontar', () => {
    const otras = [...movs, mov('MOV-000002', T.SALIDA_OBRA, 2, -1, { obra_id: 'OB-1' })]
    expect(crearAjusteConteo(otras, { conteo, costo_unitario: 1000, usuario_id: 'U-2', fecha: 'x' }).error).toMatch(/cambió/)
  })
  it('un ajuste no se reversa', () => {
    const aj = crearAjusteConteo(movs, { conteo, costo_unitario: 1000, usuario_id: 'U-2', fecha: 'x' }).movimiento
    expect(crearReversa([...movs, aj], aj.id, { usuario_id: 'U-3', motivo: 'deshacer el ajuste', fecha: 'x' }).ok).toBe(false)
  })
})

describe('lotes y cilindros', () => {
  const lote = { id: 'LOT-0001', articulo_id: 'A1', codigo: 'REF-L0001', cantidad: 4 }
  const movs = [mov('MOV-000001', T.ENTRADA_COMPRA, 10, 1)]
  it('el restante descuenta lo que salió con ese lote', () => {
    const conSalida = [...movs, mov('MOV-000002', T.SALIDA_OBRA, 3, -1, { obra_id: 'OB-1', lote_id: 'LOT-0001' })]
    expect(restanteLote(lote, movs)).toBe(4)
    expect(restanteLote(lote, conSalida)).toBe(1)
  })
  it('una salida por lote no puede exceder el lote, aunque haya stock general', () => {
    const r = crearMovimiento(movs, { tipo: T.SALIDA_OBRA, articulo_id: 'A1', cantidad: 5, costo_unitario: 1000, obra_id: 'OB-1', usuario_id: 'U', fecha: 'x', lote })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/solo tiene 4/)
    const ok = crearMovimiento(movs, { tipo: T.SALIDA_OBRA, articulo_id: 'A1', cantidad: 4, costo_unitario: 1000, obra_id: 'OB-1', usuario_id: 'U', fecha: 'x', lote })
    expect(ok.movimiento.lote_id).toBe('LOT-0001')
  })
})
