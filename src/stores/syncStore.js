import { create } from 'zustand'
import { isoLocal } from '@/domain/format'

export const useSyncStore = create((set) => ({
  /** Simulación de conectividad: false = "Modo sin señal". */
  online: true,
  /** @type {Array<{id:string, tipo:'HOJA'|'RETIRO', obra_id:string, obra_nombre:string, creadoEn:string, estado:'PENDIENTE'|'ERROR', error:string|null, intentos:number, payload:any}>} */
  pendientes: [],
  ultimoSync: null,
  sincronizando: false,
  /** Demo: fuerza la posición GPS (REAL usa el dispositivo). @type {'REAL'|'DENTRO'|'FUERA'} */
  gpsModo: 'REAL',
  setOnline: (online) => set({ online }),
  setPendientes: (pendientes) => set({ pendientes }),
  setSincronizando: (sincronizando) => set({ sincronizando }),
  marcarSync: () => set({ ultimoSync: isoLocal() }),
  setGpsModo: (gpsModo) => set({ gpsModo }),
}))
