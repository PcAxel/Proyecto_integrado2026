import { describe, it, expect } from 'vitest'
import { diasHasta, alertasVencimiento, alertasOperativas } from '../alertas.js'
import { kpisGerencia, comparativoObras } from '../kpis.js'
import { prepararTabla, nombreArchivo } from '../exportar.js'

const HOY = '2026-10-23'

describe('alertas', () => {
  it('calcula días entre fechas sin desfase horario', () => {
    expect(diasHasta('2026-10-30', HOY)).toBe(7)
    expect(diasHasta('2026-10-20', HOY)).toBe(-3)
    expect(diasHasta('2026-10-23T23:59:00', HOY)).toBe(0)
  })
  it('clasifica vencimientos: vencido crítico, ≤15 días advertencia, resto info; ignora lo lejano', () => {
    const r = alertasVencimiento({
      hoy: HOY,
      personal: [{ id: 'T-1', nombre: 'Ana', activo: true, vencimiento_licencia: '2026-10-20' }, { id: 'T-2', nombre: 'Luis', activo: true, vencimiento_licencia: '2027-06-01' }],
      flota: [{ id: 'V1', patente: 'AA-11', activo: true, vencimiento_revision: '2026-11-01', vencimiento_seguro: '2026-12-10' }],
    })
    expect(r.map((a) => [a.tipo, a.severidad])).toEqual([['LICENCIA', 'CRITICA'], ['REVISION_TECNICA', 'ADVERTENCIA'], ['SEGURO', 'INFO']])
    expect(r[0].detalle).toBe('Vencido hace 3 día(s)')
  })
  it('alertas operativas: CU30, stock y hojas antiguas', () => {
    const r = alertasOperativas({
      hoy: HOY,
      obras: [{ id: 'OB-1', nombre: 'Urgente', estado: 'EN_CURSO', es_emergencia_sin_presupuesto: true }],
      articulos: [{ id: 'A1', sku: 'X', nombre: 'x', activo: true, estado_stock: 'SIN_STOCK' }, { id: 'A2', sku: 'Y', nombre: 'y', activo: true, estado_stock: 'BAJO', stock: 1, unidad: 'un', stock_minimo: 4 }],
      hojas: [{ id: 'HS-1', estado: 'ENVIADA', fecha: '2026-10-10T10:00:00' }, { id: 'HS-2', estado: 'ENVIADA', fecha: '2026-10-22T10:00:00' }],
      retiros: [{ estado: 'PENDIENTE' }],
    })
    expect(r[0].severidad).toBe('CRITICA')
    expect(r.map((a) => a.tipo)).toEqual(expect.arrayContaining(['CU30', 'SIN_STOCK', 'STOCK_BAJO', 'HOJA_PENDIENTE', 'RETIROS']))
    expect(r.filter((a) => a.tipo === 'HOJA_PENDIENTE')).toHaveLength(1)
  })
})

describe('kpisGerencia', () => {
  const pres = (estado, venta, costo) => ({ estado, materiales: [], mano_obra: [], adicionales: [{ monto: costo }], precio_venta_neto: venta })
  it('pondera el margen por venta y cuenta presupuestos bajo margen', () => {
    const k = kpisGerencia({
      presupuestos: [pres('APROBADO', 1000, 600), pres('APROBADO', 3000, 2100), pres('ENVIADO', 1000, 900), pres('BORRADOR', 1000, 500)],
      obras: [{ id: 'O1', estado: 'EN_CURSO', es_emergencia_sin_presupuesto: true }, { id: 'O2', estado: 'FINALIZADA' }],
      hojas: [{ estado: 'ENVIADA' }, { estado: 'APROBADA' }], retiros: [{ estado: 'PENDIENTE' }],
      articulos: [{ activo: true, stock: 2, costo_unitario: 100, estado_stock: 'BAJO' }, { activo: true, stock: 0, costo_unitario: 50, estado_stock: 'SIN_STOCK' }],
      costos: { O1: 500 },
    })
    expect(k).toMatchObject({ ventaAprobada: 4000, margenPonderado: 32.5, presupuestosEnCurso: 2, presupuestosBajoMargen: 1, obrasActivas: 1, cu30Pendientes: 1, hojasPorAuditar: 1, retirosPendientes: 1, articulosBajoMinimo: 1, articulosSinStock: 1, valorInventario: 200, costoRealObrasActivas: 500 })
  })
  it('omite grupos sin acceso y oculta inventario sin costos', () => {
    const k = kpisGerencia({ presupuestos: null, obras: null, hojas: null, retiros: null, articulos: [{ activo: true, stock: 1, estado_stock: 'OK' }], costos: null })
    expect(k.ventaAprobada).toBeUndefined()
    expect(k.valorInventario).toBeNull()
  })
  it('comparativo de obras ordena por costo real', () => {
    const r = comparativoObras(
      [{ id: 'O1', nombre: 'A', estado: 'EN_CURSO', presupuesto_id: 'P1' }, { id: 'O2', nombre: 'B', estado: 'EN_CURSO', presupuesto_id: 'P2' }, { id: 'O3', nombre: 'C', estado: 'EN_CURSO', presupuesto_id: null }],
      [pres('APROBADO', 2000, 1000), pres('APROBADO', 2000, 1000)].map((p, i) => ({ ...p, id: `P${i + 1}` })),
      { O1: 1200, O2: 800 },
    )
    expect(r.map((x) => x.id)).toEqual(['O1', 'O2'])
    expect(r[0]).toMatchObject({ presupuestado: 1000, real: 1200, estadoDesvio: 'SOBRECOSTO' })
  })
})

describe('exportar', () => {
  const cols = [{ titulo: 'Obra', clave: 'n' }, { titulo: 'Monto', clave: 'm', tipo: 'moneda' }, { titulo: 'Margen', clave: 'p', tipo: 'porcentaje' }, { titulo: 'Fecha', clave: 'f', tipo: 'fecha' }]
  const filas = [{ n: 'Cámara', m: 1250000, p: 32.5, f: '2026-10-23T09:00:00' }, { n: 'Sin dato', m: null, p: null, f: null }]
  it('Excel conserva números; PDF entrega texto formateado', () => {
    expect(prepararTabla(cols, filas, 'excel').filas[0]).toEqual(['Cámara', 1250000, 0.325, '23-10-2026'])
    expect(prepararTabla(cols, filas, 'pdf').filas[0]).toEqual(['Cámara', '$1.250.000', '32,5 %', '23-10-2026'])
  })
  it('valores vacíos: null numérico en Excel, vacío en PDF', () => {
    expect(prepararTabla(cols, filas, 'excel').filas[1]).toEqual(['Sin dato', null, null, ''])
    expect(prepararTabla(cols, filas, 'pdf').filas[1]).toEqual(['Sin dato', '', '', ''])
  })
  it('nombre de archivo sin tildes ni espacios', () => {
    expect(nombreArchivo('Log de Auditoría', '2026-10-23T10:00:00')).toBe('log-de-auditoria-2026-10-23')
  })
})

import { kpisGerencia as kpis2 } from '../kpis.js'

describe('kpis de personal y flota', () => {
  it('resume dotación, tarifa promedio y estado de la flota', () => {
    const k = kpis2({
      presupuestos: null, obras: null, hojas: null, retiros: null, articulos: null, costos: null,
      personal: [{ activo: true, costo_hora_hombre: 10000 }, { activo: true, costo_hora_hombre: 8000 }, { activo: false, costo_hora_hombre: 99999 }],
      flota: [{ estado: 'ACTIVO', km_actual: 1000, activo: true }, { estado: 'EN_TALLER', km_actual: 500, activo: true }],
    })
    expect(k).toMatchObject({ tecnicosActivos: 2, tecnicosTotal: 3, tarifaPromedio: 9000, vehiculosOperativos: 1, vehiculosEnTaller: 1, kmFlota: 1500 })
  })
  it('sin acceso a personal no devuelve esos grupos', () => {
    const k = kpis2({ presupuestos: null, obras: null, hojas: null, retiros: null, articulos: null, costos: null })
    expect(k.tecnicosActivos).toBeUndefined()
    expect(k.kmFlota).toBeUndefined()
  })
})
