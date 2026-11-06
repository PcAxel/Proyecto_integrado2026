import { api, request } from '@/services/api'

/**
 * Acceso a las tablas del ERP. La fuente de verdad es el servidor (Django/MySQL): al iniciar se descarga una
 * instantánea de lo que el rol puede ver, los servicios trabajan sobre ella con la misma interfaz de siempre y
 * las escrituras se envían al servidor en un lote atómico (`confirmar`). Si el servidor rechaza algo, se descarta
 * lo local y se vuelve a leer del servidor: nada queda a medias.
 *
 * Deliberadamente NO expone borrado de filas: las entidades críticas son append-only (P1, P2) y las maestras se desactivan.
 * En pruebas (modo `test`) se parte del dataset de ejemplo en memoria, sin red.
 */

/** Prefijo y ancho del id autogenerado por tabla (igual que el servidor: el id siguiente es cantidad + 1). */
const ID_FORMAT = {
  articulos: ['ART-', 3], clientes: ['CLI-', 3], proveedores: ['PRV-', 3],
  cardex: ['MOV-', 6], facturas: ['FC-', 4], notas_credito: ['NC-', 4],
  conteos: ['CNT-', 4], lotes: ['LOT-', 4], presupuestos: ['PRE-', 4], obras: ['OB-', 4], hojas: ['HS-', 4], retiros: ['SR-', 4], asistencia: ['ASI-', 6], usuarios: ['U-', 3], auditoria: ['LOG-', 6],
}
const TABLAS = ['usuarios', 'conteos', 'lotes', 'clientes', 'proveedores', 'articulos', 'cardex', 'facturas', 'notas_credito', 'presupuestos', 'obras',
  'hojas', 'retiros', 'personal', 'flota', 'asistencia', 'auditoria']
const EN_PRUEBAS = import.meta.env.MODE === 'test'

let tables = null
let ready = null
let cargadoEn = 0
/** Filas reales por tabla según el servidor (el rol puede no ver todas las filas, pero los ids se asignan sobre el total). */
let contadores = null
/** @type {Array<{op:'insert'|'patch', tabla:string, fila?:object, id?:string, cambios?:object}>} */
let pendientes = []

const vacias = () => Object.fromEntries(TABLAS.map((t) => [t, []]))

async function descargar() {
  if (EN_PRUEBAS) {
    const { createSeed } = await import('./seed')
    tables = { ...vacias(), ...createSeed() }
  } else {
    const { _contadores, ...snap } = await api.get('/erp/snapshot/')
    tables = { ...vacias(), ...snap }
    contadores = _contadores
  }
  cargadoEn = Date.now()
  pendientes = []
}

/** Carga la instantánea inicial. Idempotente. */
export function initDb() {
  ready ??= descargar().catch((e) => { ready = null; throw e })
  return ready
}

/** Vuelve a leer del servidor si lo local tiene más de `maxEdadMs` (otros usuarios pueden haber escrito). */
export async function refrescar(maxEdadMs = 0) {
  await initDb()
  if (!EN_PRUEBAS && Date.now() - cargadoEn > maxEdadMs) await descargar()
}

/** Deshace en memoria lo escrito localmente y aún no confirmado (último primero). Funciona sin conexión. */
function deshacerLocal() {
  for (const op of [...pendientes].reverse()) {
    const filas = tables?.[op.tabla]
    if (!filas) continue
    if (op.op === 'insert') {
      const i = filas.findIndex((r) => r.id === op.fila.id)
      if (i >= 0) filas.splice(i, 1)
    } else {
      const fila = filas.find((r) => r.id === op.id)
      if (fila) Object.assign(fila, op.previo)
    }
  }
  pendientes = []
}

/** Descarta cambios locales sin confirmar; si hay conexión, además recarga del servidor. */
export async function descartar() {
  deshacerLocal()
  if (!EN_PRUEBAS) await descargar().catch(() => {})
}

/** ¿Ya hay una instantánea cargada? Permite seguir leyendo sin conexión. */
export const hayDatos = () => tables !== null

/** Envía las escrituras pendientes al servidor en un solo lote atómico y adopta las filas que devuelve. */
export async function confirmar() {
  if (!pendientes.length) return
  if (EN_PRUEBAS) { pendientes = []; return }
  const ops = pendientes.map(({ previo, ...op }) => op) // `previo` es solo para deshacer en local
  const { filas } = await request('/erp/lote/', { method: 'POST', body: { ops } })
  ops.filter((op) => op.op === 'insert').forEach((op) => { if (contadores) contadores[op.tabla] += 1 })
  pendientes = []
  filas.forEach((f, i) => {
    const fila = table(ops[i].tabla).find((r) => r.id === f.id)
    if (fila) Object.assign(fila, f)
  })
  cargadoEn = Date.now()
}

function table(name) {
  if (!tables?.[name]) throw new Error(`Tabla desconocida o DB no inicializada: ${name}`)
  return tables[name]
}

export const db = {
  all: (name) => table(name),
  find: (name, id) => table(name).find((r) => r.id === id) ?? null,
  nextId(name) {
    const [prefix, width] = ID_FORMAT[name]
    // Total del servidor + lo que este mismo lote ya agregó. En pruebas no hay servidor: se usa la tabla local.
    const base = contadores ? contadores[name] + pendientes.filter((op) => op.op === 'insert' && op.tabla === name).length : table(name).length
    return `${prefix}${String(base + 1).padStart(width, '0')}`
  },
  insert(name, row) {
    table(name).push(row)
    pendientes.push({ op: 'insert', tabla: name, fila: row })
    return row
  },
  /** Fusiona campos en una fila existente. Los servicios de tablas inmutables no la invocan. */
  patch(name, id, cambios) {
    const row = db.find(name, id)
    if (!row) throw new Error(`Fila no encontrada: ${name}/${id}`)
    const previo = Object.fromEntries(Object.keys(cambios).map((k) => [k, row[k]]))
    Object.assign(row, cambios)
    pendientes.push({ op: 'patch', tabla: name, id, cambios, previo })
    return row
  },
  /** Restaura el dataset de ejemplo (solo pruebas). */
  async reset() {
    pendientes = []
    ready = null
    await initDb()
  },
}
