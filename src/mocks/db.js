import { get, set } from 'idb-keyval'
import { createSeed } from './seed'

// v2: la flota incorpora marca, modelo, kilometraje y estado; las hojas registran vehículo y kilómetros.
const KEY = 'fyag-db-v2'

/** Prefijo y ancho del id autogenerado por tabla (equivale al AutoField de Django). */
const ID_FORMAT = {
  articulos: ['ART-', 3], clientes: ['CLI-', 3], proveedores: ['PRV-', 3],
  cardex: ['MOV-', 6], facturas: ['FC-', 4], notas_credito: ['NC-', 4],
  presupuestos: ['PRE-', 4], obras: ['OB-', 4], hojas: ['HS-', 4], retiros: ['SR-', 4], usuarios: ['U-', 3], auditoria: ['LOG-', 6],
}

let tables = null
let ready = null
let saveTimer = null

/** Carga desde IndexedDB o siembra el dataset. Idempotente. */
export function initDb() {
  if (!ready) {
    ready = (async () => {
      let saved = null
      try {
        saved = await get(KEY)
      } catch {
        /* sin IndexedDB (SSR/tests): se trabaja solo en memoria */
      }
      const seed = createSeed()
      tables = { ...seed, ...(saved ?? {}) }
      if (!saved) persistNow()
    })()
  }
  return ready
}

function persistNow() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await set(KEY, tables)
    } catch {
      /* persistencia best-effort */
    }
  }, 50)
}

function table(name) {
  if (!tables?.[name]) throw new Error(`Tabla desconocida o DB no inicializada: ${name}`)
  return tables[name]
}

/**
 * Acceso a tablas en memoria. Deliberadamente NO expone borrado de filas:
 * las entidades críticas son append-only (P1, P2) y las maestras se desactivan.
 */
export const db = {
  all: (name) => table(name),
  find: (name, id) => table(name).find((r) => r.id === id) ?? null,
  nextId(name) {
    const [prefix, width] = ID_FORMAT[name]
    return `${prefix}${String(table(name).length + 1).padStart(width, '0')}`
  },
  insert(name, row) {
    table(name).push(row)
    persistNow()
    return row
  },
  /** Fusiona campos en una fila existente. Los servicios de tablas inmutables no la invocan. */
  patch(name, id, cambios) {
    const row = db.find(name, id)
    if (!row) throw new Error(`Fila no encontrada: ${name}/${id}`)
    Object.assign(row, cambios)
    persistNow()
    return row
  },
  /** Restaura el dataset semilla (solo modo demo). */
  async reset() {
    tables = createSeed()
    persistNow()
  },
}
