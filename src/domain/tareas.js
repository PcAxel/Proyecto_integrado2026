import { can } from './rbac.js'
import { puedeAprobarPresupuesto } from './rentabilidad.js'
import { formatPct } from './format.js'

const ORDEN = { CRITICA: 0, ADVERTENCIA: 1, INFO: 2 }

/**
 * @typedef {{id:string, severidad:'CRITICA'|'ADVERTENCIA'|'INFO', titulo:string, detalle:string, ruta:string, cta:string}} Tarea
 */

/**
 * «Pendientes para ti»: lo que cada rol puede resolver ahora, derivado de sus permisos. Un rol solo recibe tareas
 * de acciones que puede ejecutar (el de solo lectura no recibe ninguna), y nunca una que el sistema le rechazaría.
 *
 * @param {{rol: import('./rbac.js').Rol, limite?: number, fuentes: {
 *   presupuestosPorAprobar?: Array<{id:string, titulo:string, margenPct:number, bajoMinimo:boolean}>,
 *   obrasListasParaCerrar?: Array<{id:string, nombre:string}>,
 *   obrasCU30?: Array<{id:string, nombre:string}>,
 *   hojasPorAuditar?: Array<{id:string, obra_nombre:string, critico:boolean, dias:number}>,
 *   retirosPendientes?: Array<{id:string, obra_nombre:string, items:number, faltaStock:boolean}>,
 *   articulosEnAlerta?: {sinStock:number, bajo:number},
 *   vencimientos?: Array<{id:string, titulo:string, detalle:string, severidad:string}>,
 *   vehiculosEnTaller?: Array<{patente:string}>,
 * }}} p
 * @returns {Tarea[]}
 */
export function construirTareas({ rol, fuentes, limite = 8 }) {
  const f = fuentes
  const t = []

  if (can(rol, 'presupuestos.aprobar')) {
    for (const p of f.presupuestosPorAprobar ?? []) {
      if (!puedeAprobarPresupuesto(rol, { bajoMinimo: p.bajoMinimo }).ok) continue // margen < 20 %: lo decide la Gerencia
      t.push({ id: `apr-${p.id}`, severidad: p.bajoMinimo ? 'ADVERTENCIA' : 'INFO', titulo: `Aprobar ${p.id}`, detalle: `${p.titulo}. Margen ${formatPct(p.margenPct)}${p.bajoMinimo ? ', bajo el mínimo' : ''}`, ruta: `/erp/presupuestos/${p.id}`, cta: 'Revisar' })
    }
  }
  if (can(rol, 'obras.cerrar')) {
    for (const o of f.obrasListasParaCerrar ?? []) {
      t.push({ id: `cer-${o.id}`, severidad: 'INFO', titulo: `Finalizar ${o.id}`, detalle: `${o.nombre}. Cumple los 6 requisitos de cierre`, ruta: `/erp/obras/${o.id}`, cta: 'Cerrar obra' })
    }
  }
  if (can(rol, 'obras.crear')) {
    for (const o of f.obrasCU30 ?? []) {
      t.push({ id: `cu30-${o.id}`, severidad: 'ADVERTENCIA', titulo: `Regularizar ${o.id}`, detalle: `${o.nombre}. Abierta sin presupuesto (CU30)`, ruta: `/erp/obras/${o.id}`, cta: 'Regularizar' })
    }
  }
  if (can(rol, 'hojas.auditar')) {
    for (const h of f.hojasPorAuditar ?? []) {
      const severidad = h.critico || h.dias >= 7 ? 'CRITICA' : h.dias >= 3 ? 'ADVERTENCIA' : 'INFO'
      const motivo = h.critico ? 'checklist crítico' : h.dias >= 1 ? `espera hace ${h.dias} día${h.dias === 1 ? '' : 's'}` : 'enviada hoy'
      t.push({ id: `hoja-${h.id}`, severidad, titulo: `Auditar ${h.id}`, detalle: `${h.obra_nombre}. ${motivo[0].toUpperCase()}${motivo.slice(1)}`, ruta: `/erp/terreno?hoja=${h.id}`, cta: 'Auditar' })
    }
  }
  if (can(rol, 'cardex.crear')) {
    for (const r of f.retirosPendientes ?? []) {
      t.push({ id: `ret-${r.id}`, severidad: r.faltaStock ? 'ADVERTENCIA' : 'INFO', titulo: `Atender ${r.id}`, detalle: `${r.obra_nombre}. ${r.items} ítem${r.items === 1 ? '' : 's'}${r.faltaStock ? ', falta stock' : ''}`, ruta: '/erp/bodega?tab=solicitudes', cta: 'Atender' })
    }
    const a = f.articulosEnAlerta
    if (a && a.sinStock + a.bajo > 0) {
      t.push({ id: 'reponer', severidad: a.sinStock ? 'CRITICA' : 'ADVERTENCIA', titulo: 'Reponer stock', detalle: `${a.sinStock} sin stock y ${a.bajo} bajo el mínimo`, ruta: '/erp/bodega?tab=articulos', cta: 'Ver artículos' })
    }
  }
  if (can(rol, 'personal.editar')) {
    for (const v of f.vencimientos ?? []) {
      if (v.severidad === 'INFO') continue
      t.push({ id: `venc-${v.id}`, severidad: v.severidad, titulo: v.titulo, detalle: v.detalle, ruta: '/erp/personal?tab=alertas', cta: 'Ver' })
    }
    for (const v of f.vehiculosEnTaller ?? []) {
      t.push({ id: `taller-${v.patente}`, severidad: 'INFO', titulo: `${v.patente} está en taller`, detalle: 'No aparece en la app de terreno hasta reactivarlo', ruta: '/erp/personal?tab=flota', cta: 'Ver flota' })
    }
  }
  return t.map((x, i) => ({ ...x, _i: i })).sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad] || a._i - b._i).slice(0, limite).map(({ _i, ...x }) => x)
}
