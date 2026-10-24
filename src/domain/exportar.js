import { formatCLP } from './money.js'
import { formatFecha, formatFechaHora, formatPct } from './format.js'

/**
 * @typedef {{titulo:string, clave:string|((fila:any)=>any), tipo?:'texto'|'moneda'|'numero'|'fecha'|'fechaHora'|'porcentaje', ancho?:number}} ColumnaExport
 */

const valorDe = (col, fila) => (typeof col.clave === 'function' ? col.clave(fila) : fila[col.clave])

/**
 * Convierte filas de dominio en una tabla lista para exportar.
 * Excel conserva números reales (montos y cantidades siguen siendo sumables); PDF recibe texto formateado.
 * @param {ColumnaExport[]} columnas @param {any[]} filas @param {'excel'|'pdf'} destino
 * @returns {{encabezados:string[], filas:Array<Array<string|number|null>>}}
 */
export function prepararTabla(columnas, filas, destino) {
  const celda = (col, fila) => {
    const v = valorDe(col, fila)
    if (v === null || v === undefined || v === '') return destino === 'excel' && ['moneda', 'numero', 'porcentaje'].includes(col.tipo) ? null : ''
    switch (col.tipo) {
      case 'moneda': return destino === 'excel' ? Math.round(v) : formatCLP(v)
      case 'numero': return destino === 'excel' ? Number(v) : String(v).replace('.', ',')
      case 'porcentaje': return destino === 'excel' ? Number(v) / 100 : formatPct(v)
      case 'fecha': return formatFecha(String(v))
      case 'fechaHora': return formatFechaHora(String(v))
      default: return String(v)
    }
  }
  return { encabezados: columnas.map((c) => c.titulo), filas: filas.map((f) => columnas.map((c) => celda(c, f))) }
}

/** Nombre de archivo seguro con fecha: "obras-2026-10-23". */
export function nombreArchivo(base, fecha) {
  const limpio = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${limpio}-${fecha.slice(0, 10)}`
}
