import { simularRentabilidad, compararCostos } from './rentabilidad.js'
import { resumenFlota } from './flota.js'

/**
 * Indicadores de gerencia. Cada grupo es null si el rol no tiene acceso a esos datos
 * (el servicio pasa `null` en la fuente correspondiente).
 * @param {{presupuestos:any[]|null, obras:any[]|null, hojas:any[]|null, retiros:any[]|null, articulos:any[]|null, costos:Record<string,number>|null}} fuentes
 */
export function kpisGerencia({ presupuestos, obras, hojas, retiros, articulos, costos, personal = null, flota = null, documentos = null }) {
  const kpis = {}
  if (obras) {
    kpis.obrasActivas = obras.filter((o) => o.estado === 'EN_CURSO').length
    kpis.obrasPlanificadas = obras.filter((o) => o.estado === 'PLANIFICADA').length
    kpis.obrasFinalizadas = obras.filter((o) => o.estado === 'FINALIZADA').length
    kpis.cu30Pendientes = obras.filter((o) => o.es_emergencia_sin_presupuesto && o.estado !== 'FINALIZADA').length
  }
  if (presupuestos) {
    const aprobados = presupuestos.filter((p) => p.estado === 'APROBADO').map((p) => simularRentabilidad(p))
    const venta = aprobados.reduce((s, x) => s + x.ventaNeto, 0)
    const margen = aprobados.reduce((s, x) => s + x.margenMonto, 0)
    kpis.ventaAprobada = venta
    kpis.margenPonderado = venta > 0 ? Math.round((margen / venta) * 1000) / 10 : 0
    const abiertos = presupuestos.filter((p) => ['BORRADOR', 'ENVIADO'].includes(p.estado))
    kpis.presupuestosEnCurso = abiertos.length
    kpis.presupuestosBajoMargen = abiertos.filter((p) => simularRentabilidad(p).bajoMinimo).length
  }
  if (hojas) kpis.hojasPorAuditar = hojas.filter((h) => h.estado === 'ENVIADA').length
  if (retiros) kpis.retirosPendientes = retiros.filter((r) => r.estado === 'PENDIENTE').length
  if (articulos) {
    const activos = articulos.filter((a) => a.activo)
    kpis.articulosBajoMinimo = activos.filter((a) => a.estado_stock === 'BAJO').length
    kpis.articulosSinStock = activos.filter((a) => a.estado_stock === 'SIN_STOCK').length
    kpis.inventarioSanoPct = activos.length ? Math.round((activos.filter((a) => a.estado_stock === 'OK').length / activos.length) * 100) : 100
    kpis.valorInventario = activos.some((a) => a.costo_unitario === undefined) ? null : Math.round(activos.reduce((s, a) => s + a.stock * a.costo_unitario, 0))
  }
  if (personal) {
    const activos = personal.filter((p) => p.activo)
    kpis.tecnicosActivos = activos.length
    kpis.tecnicosTotal = personal.length
    kpis.tarifaPromedio = activos.length ? Math.round(activos.reduce((s, p) => s + p.costo_hora_hombre, 0) / activos.length) : 0
  }
  if (flota) {
    const f = resumenFlota(flota)
    kpis.vehiculosOperativos = f.operativos
    kpis.vehiculosEnTaller = f.enTaller
    kpis.kmFlota = f.kmTotal
  }
  if (documentos) kpis.documentosAlDiaPct = documentos.total ? Math.round(((documentos.total - documentos.vencidos) / documentos.total) * 100) : 100
  if (costos && obras) {
    kpis.costoRealObrasActivas = Math.round(obras.filter((o) => o.estado === 'EN_CURSO').reduce((s, o) => s + (costos[o.id] ?? 0), 0))
  }
  return kpis
}

/**
 * Presupuestado vs. real por obra con presupuesto, ordenado por costo real.
 * @returns {Array<{id:string, nombre:string, estado:string, presupuestado:number, real:number, desvioPct:number, estadoDesvio:string}>}
 */
export function comparativoObras(obras, presupuestos, costos, limite = 6) {
  return obras
    .filter((o) => o.presupuesto_id && o.estado !== 'PLANIFICADA')
    .map((o) => {
      const p = presupuestos.find((x) => x.id === o.presupuesto_id)
      if (!p) return null
      const presupuestado = simularRentabilidad(p).costoTotal
      const real = costos[o.id] ?? 0
      const c = compararCostos(presupuestado, real)
      return { id: o.id, nombre: o.nombre, estado: o.estado, presupuestado, real, desvioPct: c.desvioPct, estadoDesvio: c.estado }
    })
    .filter(Boolean)
    .sort((a, b) => b.real - a.real)
    .slice(0, limite)
}
