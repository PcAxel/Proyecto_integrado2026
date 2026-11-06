import { create } from 'zustand'
import { isoLocal } from '@/domain/format'

export const useSyncStore = create((set) => ({
  /** Conectividad real del dispositivo (eventos online/offline del navegador). */
  online: true,
  /** @type {Array<{id:string, tipo:'HOJA'|'RETIRO'|'ASISTENCIA', obra_id:string, obra_nombre:string, creadoEn:string, estado:'PENDIENTE'|'ERROR', error:string|null, intentos:number, payload:any}>} */
  pendientes: [],
  ultimoSync: null,
  sincronizando: false,
  setOnline: (online) => set({ online }),
  setPendientes: (pendientes) => set({ pendientes }),
  setSincronizando: (sincronizando) => set({ sincronizando }),
  marcarSync: () => set({ ultimoSync: isoLocal() }),
}))
