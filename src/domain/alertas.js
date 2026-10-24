/**
 * Alertas de gestión. Funciones puras: reciben los datos y la fecha de referencia.
 * @typedef {{id:string, severidad:'CRITICA'|'ADVERTENCIA'|'INFO', tipo:string, titulo:string, detalle:string, ruta?:string, dias?:number}} Alerta
 */

const ORDEN = { CRITICA: 0, ADVERTENCIA: 1, INFO: 2 }

/** Días enteros desde `hoy` hasta `fecha` (negativo = ya pasó). Ambas "YYYY-MM-DD". */
export function diasHasta(fecha, hoy) {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [hy, hm, hd] = hoy.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86_400_000)
}

/**
 * Vencimientos de licencias del personal y de revisión técnica/seguro de la flota.
 * @param {{personal: any[], flota: any[], hoy: string, ventanaDias?: number}} p
 * @returns {Alerta[]}
 */
export function alertasVencimiento({ personal, flota, hoy, ventanaDias = 60 }) {
  const out = []
  const evaluar = (id, tipo, titulo, fecha, ruta) => {
    const dias = diasHasta(fecha, hoy)
    if (dias > ventanaDias) return
    out.push({
      id, tipo, titulo, dias, ruta,
      severidad: dias < 0 ? 'CRITICA' : dias <= 15 ? 'ADVERTENCIA' : 'INFO',
      detalle: dias < 0 ? `Vencido hace ${-dias} día(s)` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día(s)`,
    })
  }
  personal.filter((p) => p.activo).forEach((p) => evaluar(`LIC-${p.id}`, 'LICENCIA', `Licencia de conducir · ${p.nombre}`, p.vencimiento_licencia, '/erp/personal?tab=alertas'))
  flota.filter((v) => v.activo).forEach((v) => {
    evaluar(`REV-${v.id}`, 'REVISION_TECNICA', `Revisión técnica · ${v.patente}`, v.vencimiento_revision, '/erp/personal?tab=alertas')
    evaluar(`SEG-${v.id}`, 'SEGURO', `Seguro obligatorio · ${v.patente}`, v.vencimiento_seguro, '/erp/personal?tab=alertas')
  })
  return ordenarAlertas(out)
}

/**
 * Alertas operativas del negocio.
 * @param {{obras?: any[], articulos?: any[], hojas?: any[], retiros?: any[], hoy: string}} p
 * @returns {Alerta[]}
 */
export function alertasOperativas({ obras = [], articulos = [], hojas = [], retiros = [], hoy }) {
  const out = []
  obras.filter((o) => o.es_emergencia_sin_presupuesto && o.estado !== 'FINALIZADA').forEach((o) => {
    out.push({ id: `CU30-${o.id}`, tipo: 'CU30', severidad: 'ADVERTENCIA', titulo: `CU30 sin regularizar · ${o.id}`, detalle: o.nombre, ruta: `/erp/obras/${o.id}` })
  })
  articulos.filter((a) => a.activo && a.estado_stock === 'SIN_STOCK').forEach((a) => {
    out.push({ id: `SS-${a.id}`, tipo: 'SIN_STOCK', severidad: 'CRITICA', titulo: `Sin stock · ${a.sku}`, detalle: a.nombre, ruta: `/erp/bodega?tab=cardex&articulo=${a.id}` })
  })
  articulos.filter((a) => a.activo && a.estado_stock === 'BAJO').forEach((a) => {
    out.push({ id: `SB-${a.id}`, tipo: 'STOCK_BAJO', severidad: 'ADVERTENCIA', titulo: `Bajo mínimo · ${a.sku}`, detalle: `${a.stock} ${a.unidad} (mínimo ${a.stock_minimo})`, ruta: `/erp/bodega?tab=cardex&articulo=${a.id}` })
  })
  hojas.filter((h) => h.estado === 'ENVIADA').forEach((h) => {
    const dias = -diasHasta(h.fecha, hoy)
    if (dias >= 3) out.push({ id: `HA-${h.id}`, tipo: 'HOJA_PENDIENTE', severidad: dias >= 7 ? 'CRITICA' : 'ADVERTENCIA', titulo: `Hoja sin auditar · ${h.id}`, detalle: `${dias} días esperando auditoría`, ruta: '/erp/terreno', dias })
  })
  const pend = retiros.filter((r) => r.estado === 'PENDIENTE')
  if (pend.length) out.push({ id: 'RET-PEND', tipo: 'RETIROS', severidad: 'INFO', titulo: `${pend.length} solicitud(es) de retiro pendiente(s)`, detalle: 'Esperan entrega de Bodega', ruta: '/erp/bodega?tab=solicitudes' })
  return ordenarAlertas(out)
}

/** @param {Alerta[]} alertas @returns {Alerta[]} */
export const ordenarAlertas = (alertas) => [...alertas].sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad] || (a.dias ?? 0) - (b.dias ?? 0))
