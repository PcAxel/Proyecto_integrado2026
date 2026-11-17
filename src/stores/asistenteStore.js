import { create } from 'zustand'

/**
 * Estado compartido del asistente de IA (no se guarda): si el panel está abierto (el ERP le deja su lugar a la derecha) y si la IA está
 * trabajando (enciende el resplandor del borde de la pantalla).
 */
export const useAsistenteStore = create((set) => ({
  abierto: false,
  trabajando: false,
  /** Acepta un booleano o una función (igual que el setter de useState). */
  setAbierto: (v) => set((s) => ({ abierto: typeof v === 'function' ? v(s.abierto) : Boolean(v) })),
  setTrabajando: (trabajando) => set({ trabajando }),
}))
