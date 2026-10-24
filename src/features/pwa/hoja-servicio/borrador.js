import { get, set, del } from 'idb-keyval'

const KEY = 'fyag-borrador-hoja'
let memoria = null

/** El borrador sobrevive a recargas y cortes de señal. Respaldo en memoria si no hay IndexedDB. */
export async function cargarBorrador() {
  try {
    return (await get(KEY)) ?? null
  } catch {
    return memoria
  }
}

export async function guardarBorrador(valor) {
  memoria = valor
  try {
    await set(KEY, valor)
  } catch {
    /* solo memoria */
  }
}

export async function limpiarBorrador() {
  memoria = null
  try {
    await del(KEY)
  } catch {
    /* nada que limpiar */
  }
}
