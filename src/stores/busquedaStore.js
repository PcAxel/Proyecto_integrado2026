import { create } from 'zustand'

/**
 * Estado del buscador general (Ctrl/⌘ + K): lo abren el atajo de teclado, el botón de la cabecera y el asistente de IA,
 * que lo abre con el texto ya escrito. Los resultados los filtra siempre el rol de la persona (ver `busquedaService`).
 */
export const useBusquedaStore = create((set) => ({
  abierta: false,
  /** Texto con el que se abrió (vacío si se abrió a mano). */
  consulta: '',
  abrir: (consulta = '') => set({ abierta: true, consulta: String(consulta).slice(0, 80) }),
  cerrar: () => set({ abierta: false, consulta: '' }),
  alternar: () => set((s) => (s.abierta ? { abierta: false, consulta: '' } : { abierta: true, consulta: '' })),
}))
