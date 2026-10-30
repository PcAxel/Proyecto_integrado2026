import { get, set } from 'idb-keyval'
import { useSyncStore } from '@/stores/syncStore'
import { clasificarErrorSync, ESTADOS_COLA, nuevoClientId } from '@/domain/sync'
import { isoLocal } from '@/domain/format'
import { hojasService } from './hojas.service'
import { retirosService } from './retiros.service'
import { asistenciaService } from './asistencia.service'

const KEY = 'fyag-cola'
const ENVIAR = { HOJA: (p) => hojasService.enviar({ ...p, desde_cola: true }), RETIRO: (p) => retirosService.create(p), ASISTENCIA: (p) => asistenciaService.marcar(p) }

// Respaldo en memoria cuando IndexedDB no existe (tests, modo privado).
let memoria = []

async function leer() {
  try {
    return (await get(KEY)) ?? []
  } catch {
    return memoria
  }
}

async function guardar(items) {
  memoria = items
  try {
    await set(KEY, items)
  } catch {
    /* solo memoria */
  }
  useSyncStore.getState().setPendientes(items)
}

/** Carga la cola persistida al store (al abrir la app). */
export async function refrescarCola() {
  const items = await leer()
  useSyncStore.getState().setPendientes(items)
  return items
}

async function encolar(tipo, payload, meta) {
  const items = await leer()
  const item = {
    id: `Q-${payload.client_id}`, tipo, payload, obra_id: payload.obra_id, obra_nombre: meta.obra_nombre ?? payload.obra_id,
    creadoEn: isoLocal(), estado: ESTADOS_COLA.PENDIENTE, error: null, intentos: 0,
  }
  await guardar([...items, item])
  return item
}

/**
 * Envía el registro si hay conexión; si no hay señal o el servidor falla, lo guarda en la cola.
 * Un rechazo del servidor (4xx) NO se encola: se informa al usuario para que lo corrija.
 * @param {'HOJA'|'RETIRO'|'ASISTENCIA'} tipo @param {object} payload @param {{obra_nombre?:string}} [meta]
 * @returns {Promise<{encolado:boolean, resultado?:any}>}
 */
export async function enviarOEncolar(tipo, payload, meta = {}) {
  const conId = { ...payload, client_id: payload.client_id ?? nuevoClientId() }
  if (!useSyncStore.getState().online) {
    await encolar(tipo, conId, meta)
    return { encolado: true }
  }
  try {
    return { encolado: false, resultado: await ENVIAR[tipo]({ ...conId, desde_cola: false }) }
  } catch (e) {
    if (clasificarErrorSync(e) === 'REINTENTAR') {
      await encolar(tipo, conId, meta)
      return { encolado: true }
    }
    throw e
  }
}

/**
 * Procesa la cola en orden. Los 5xx/red quedan pendientes; los 4xx pasan a ERROR con el motivo.
 * @returns {Promise<{enviados:number, errores:number, pendientes:number}>}
 */
export async function procesarCola() {
  const store = useSyncStore.getState()
  if (!store.online || store.sincronizando) return { enviados: 0, errores: 0, pendientes: store.pendientes.length }
  store.setSincronizando(true)
  let enviados = 0
  let errores = 0
  try {
    let items = await leer()
    for (const item of items.filter((i) => i.estado === ESTADOS_COLA.PENDIENTE)) {
      try {
        await ENVIAR[item.tipo](item.payload)
        items = items.filter((i) => i.id !== item.id)
        enviados += 1
      } catch (e) {
        const reintentar = clasificarErrorSync(e) === 'REINTENTAR'
        items = items.map((i) => (i.id === item.id
          ? { ...i, intentos: i.intentos + 1, estado: reintentar ? ESTADOS_COLA.PENDIENTE : ESTADOS_COLA.ERROR, error: e.message }
          : i))
        if (reintentar) break // sin red: no tiene sentido seguir intentando el resto
        errores += 1
      }
      await guardar(items)
    }
    if (enviados > 0) useSyncStore.getState().marcarSync()
    return { enviados, errores, pendientes: items.filter((i) => i.estado === ESTADOS_COLA.PENDIENTE).length }
  } finally {
    useSyncStore.getState().setSincronizando(false)
  }
}

/** Saca de la cola un ítem rechazado (el técnico decidió descartarlo tras leer el error). */
export async function descartarDeCola(id) {
  const items = await leer()
  const it = items.find((i) => i.id === id)
  if (!it || it.estado !== ESTADOS_COLA.ERROR) return false
  await guardar(items.filter((i) => i.id !== id))
  return true
}

/** Vuelve a marcar como pendiente un ítem en ERROR para reintentarlo. */
export async function reintentarItem(id) {
  const items = await leer()
  await guardar(items.map((i) => (i.id === id ? { ...i, estado: ESTADOS_COLA.PENDIENTE, error: null } : i)))
}
