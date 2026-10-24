/**
 * Checklist paramétrico (Regla 4): 5 puntos críticos.
 * `tolerancia` es el % del ancho del rango que se admite fuera de él antes de pasar a CRÍTICO.
 */
export const CHECKLIST_SCHEMA = [
  { id: 'presion_psi', label: 'Presiones', unidad: 'PSI', tipo: 'numero', min: 60, max: 140, tolerancia: 0.1 },
  { id: 'amperaje_a', label: 'Amperaje', unidad: 'A', tipo: 'numero', min: 5, max: 45, tolerancia: 0.1 },
  {
    id: 'fugas',
    label: 'Fugas / Aislación',
    tipo: 'opcion',
    opciones: [
      { value: 'SIN_FUGAS', label: 'Sin fugas', estado: 'OK' },
      { value: 'FUGA_MENOR', label: 'Fuga menor', estado: 'ALERTA' },
      { value: 'FUGA_MAYOR', label: 'Fuga mayor', estado: 'CRITICO' },
    ],
  },
  { id: 'temperatura_c', label: 'Temperatura', unidad: '°C', tipo: 'numero', min: -30, max: 8, tolerancia: 0.1 },
  {
    id: 'limpieza',
    label: 'Limpieza',
    tipo: 'opcion',
    opciones: [
      { value: 'OK', label: 'Limpio', estado: 'OK' },
      { value: 'PARCIAL', label: 'Parcial', estado: 'ALERTA' },
      { value: 'DEFICIENTE', label: 'Deficiente', estado: 'CRITICO' },
    ],
  },
]

/** @typedef {'OK'|'ALERTA'|'CRITICO'|'FALTANTE'} EstadoItem */

/**
 * @param {Record<string, number|string|null|undefined>} valores
 * @returns {{items: Array<{id:string,label:string,valor:any,estado:EstadoItem}>, completo:boolean,
 *   resultado:'INCOMPLETO'|'CRITICO'|'CON_OBSERVACIONES'|'CONFORME'}}
 */
export function evaluarChecklist(valores = {}) {
  const items = CHECKLIST_SCHEMA.map((def) => {
    const valor = valores[def.id]
    return { id: def.id, label: def.label, valor, estado: evaluarItem(def, valor) }
  })
  const completo = items.every((i) => i.estado !== 'FALTANTE')
  const resultado = !completo
    ? 'INCOMPLETO'
    : items.some((i) => i.estado === 'CRITICO')
      ? 'CRITICO'
      : items.some((i) => i.estado === 'ALERTA')
        ? 'CON_OBSERVACIONES'
        : 'CONFORME'
  return { items, completo, resultado }
}

function evaluarItem(def, valor) {
  if (valor === null || valor === undefined || valor === '') return 'FALTANTE'
  if (def.tipo === 'opcion') {
    return def.opciones.find((o) => o.value === valor)?.estado ?? 'FALTANTE'
  }
  const n = Number(valor)
  if (!Number.isFinite(n)) return 'FALTANTE'
  if (n >= def.min && n <= def.max) return 'OK'
  const holgura = (def.max - def.min) * def.tolerancia
  return n >= def.min - holgura && n <= def.max + holgura ? 'ALERTA' : 'CRITICO'
}

/** Rango esperado en texto: "60–140 PSI". @param {{min:number,max:number,unidad?:string}} def */
export const rangoLegible = (def) => `${def.min}–${def.max} ${def.unidad ?? ''}`.trim()

/** Texto de un valor capturado: número con unidad u opción legible. */
export function valorLegible(def, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (def.tipo === 'opcion') return def.opciones.find((o) => o.value === valor)?.label ?? String(valor)
  return `${valor} ${def.unidad ?? ''}`.trim()
}
