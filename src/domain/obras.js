import { TIPOS_MOV } from './cardex.js'

export const TIPOS_OBRA = ['INSTALACION', 'MANTENCION', 'REPARACION', 'EMERGENCIA', 'GARANTIA']

/** CU30: solo Emergencia y Garantía pueden abrirse sin presupuesto previo. */
export const TIPOS_SIN_PRESUPUESTO = ['EMERGENCIA', 'GARANTIA']

/** @param {string} tipo */
export const requierePresupuesto = (tipo) => !TIPOS_SIN_PRESUPUESTO.includes(tipo)

/**
 * Valida la apertura de una obra.
 * @param {{tipo: string, presupuesto_id?: string|null}} input
 * @param {Array<{id:string, estado:string}>} presupuestos
 * @returns {{ok:true, es_emergencia_sin_presupuesto:boolean} | {ok:false, error:string}}
 */
export function validarCreacionObra({ tipo, presupuesto_id }, presupuestos) {
  if (!TIPOS_OBRA.includes(tipo)) return { ok: false, error: 'Tipo de obra inválido.' }
  if (presupuesto_id) {
    const p = presupuestos.find((x) => x.id === presupuesto_id)
    if (!p) return { ok: false, error: 'El presupuesto indicado no existe.' }
    if (p.estado !== 'APROBADO') return { ok: false, error: 'El presupuesto debe estar APROBADO.' }
    return { ok: true, es_emergencia_sin_presupuesto: false }
  }
  if (requierePresupuesto(tipo)) {
    return { ok: false, error: 'Este tipo de obra requiere un presupuesto aprobado.' }
  }
  return { ok: true, es_emergencia_sin_presupuesto: true }
}

const HOJAS_QUE_COSTEAN = ['ENVIADA', 'APROBADA']

/**
 * Costo real de una obra: materiales netos del Cardex + horas-hombre (Reglas 2 y 3).
 * Reversas y reingresos descuentan porque su signo es opuesto al de la salida.
 * @param {string} obraId
 * @param {import('./cardex.js').MovimientoCardex[]} movs
 * @param {Array<{obra_id:string, estado:string, horas_trabajadas:number, costo_hora_hombre:number}>} hojas
 */
export function costoRealObra(obraId, movs, hojas) {
  const materiales = movs
    .filter((m) => m.obra_id === obraId && m.tipo !== TIPOS_MOV.ENTRADA_COMPRA)
    .reduce((a, m) => a - m.signo * m.cantidad * m.costo_unitario, 0)
  const manoObra = hojas
    .filter((h) => h.obra_id === obraId && HOJAS_QUE_COSTEAN.includes(h.estado))
    .reduce((a, h) => a + h.horas_trabajadas * h.costo_hora_hombre, 0)
  return { materiales: Math.round(materiales), manoObra: Math.round(manoObra), total: Math.round(materiales + manoObra) }
}

/**
 * Los 6 checks obligatorios para finalizar una obra (RF06).
 * @param {{
 *   obra: {id:string, sobrantes_conciliados:boolean, presupuesto_id:string|null},
 *   presupuesto: {estado:string}|null,
 *   hojas: Array<{obra_id:string, estado:string, horas_trabajadas:number, costo_hora_hombre:number}>,
 *   movimientos: import('./cardex.js').MovimientoCardex[],
 *   pendientesSync: number
 * }} ctx
 * @returns {{checks: Array<{id:string,label:string,ok:boolean,detalle:string}>, puedeFinalizar:boolean}}
 */
export function validarCierreObra({ obra, presupuesto, hojas, movimientos, pendientesSync }) {
  const hojasObra = hojas.filter((h) => h.obra_id === obra.id)
  const pendientesAuditar = hojasObra.filter((h) => h.estado !== 'APROBADA').length
  const horas = hojasObra.filter((h) => HOJAS_QUE_COSTEAN.includes(h.estado)).reduce((a, h) => a + h.horas_trabajadas, 0)
  const movsObra = movimientos.filter((m) => m.obra_id === obra.id)
  const costosOk = movsObra.every((m) => m.costo_unitario > 0) && hojasObra.every((h) => h.costo_hora_hombre > 0)

  const checks = [
    {
      id: 'presupuesto',
      label: 'Presupuesto aprobado y vinculado',
      ok: presupuesto?.estado === 'APROBADO',
      detalle: presupuesto?.estado === 'APROBADO' ? 'Presupuesto aprobado.' : 'Regularice el presupuesto (obra de emergencia sin presupuesto).',
    },
    { id: 'horas', label: 'Horas de trabajo registradas', ok: horas > 0, detalle: `${horas} h registradas.` },
    {
      id: 'hojas',
      label: 'Hojas de servicio auditadas',
      ok: hojasObra.length > 0 && pendientesAuditar === 0,
      detalle: hojasObra.length === 0 ? 'Sin hojas de servicio.' : `${pendientesAuditar} hoja(s) sin aprobar.`,
    },
    {
      id: 'sobrantes',
      label: 'Sobrantes de material conciliados',
      ok: obra.sobrantes_conciliados === true,
      detalle: obra.sobrantes_conciliados ? 'Conciliado por Bodega.' : 'Bodega debe conciliar sobrantes.',
    },
    { id: 'sync', label: 'Terreno sincronizado', ok: pendientesSync === 0, detalle: `${pendientesSync} registro(s) pendiente(s) de sync.` },
    { id: 'costos', label: 'Costos calculables', ok: costosOk, detalle: costosOk ? 'Todos los costos tienen tarifa.' : 'Hay movimientos u hojas sin costo.' },
  ]
  return { checks, puedeFinalizar: checks.every((c) => c.ok) }
}

/**
 * Mano de obra imputada a una obra, agrupada por técnico (hojas ENVIADA o APROBADA).
 * @param {Array<{obra_id:string, tecnico_id:string, estado:string, horas_trabajadas:number, costo_hora_hombre:number}>} hojas
 * @param {string} obraId
 * @returns {Array<{tecnico_id:string, horas:number, costo:number, hojas:number}>}
 */
export function manoObraPorTecnico(hojas, obraId) {
  const m = new Map()
  for (const h of hojas.filter((x) => x.obra_id === obraId && HOJAS_QUE_COSTEAN.includes(x.estado))) {
    const g = m.get(h.tecnico_id) ?? { tecnico_id: h.tecnico_id, horas: 0, costo: 0, hojas: 0 }
    m.set(h.tecnico_id, { ...g, horas: g.horas + h.horas_trabajadas, costo: g.costo + h.horas_trabajadas * h.costo_hora_hombre, hojas: g.hojas + 1 })
  }
  return [...m.values()].sort((a, b) => b.costo - a.costo)
}
