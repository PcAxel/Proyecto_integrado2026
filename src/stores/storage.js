import { createJSONStorage } from 'zustand/middleware'

const memoria = new Map()
const enMemoria = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => void memoria.set(k, String(v)),
  removeItem: (k) => void memoria.delete(k),
}

/** localStorage si funciona; si no (modo privado, SSR, tests), un respaldo en memoria. */
function elegir() {
  try {
    const probe = '__fyag_probe__'
    globalThis.localStorage.setItem(probe, '1')
    globalThis.localStorage.removeItem(probe)
    return globalThis.localStorage
  } catch {
    return enMemoria
  }
}

export const almacenamiento = createJSONStorage(elegir)
