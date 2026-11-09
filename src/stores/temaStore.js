import { create } from 'zustand'

/** Tema del ERP por persona: se guarda en este navegador bajo el id de la persona, así que elegir claro no cambia el de nadie más. */
const clave = (usuarioId) => `fyag.tema.${usuarioId}`
const leer = (usuarioId) => {
  try { return localStorage.getItem(clave(usuarioId)) === 'claro' ? 'claro' : 'oscuro' } catch { return 'oscuro' }
}

export const useTemaStore = create((set, get) => ({
  tema: 'oscuro',
  usuarioId: null,
  cargar: (usuarioId) => set({ usuarioId, tema: leer(usuarioId) }),
  alternar: () => {
    const tema = get().tema === 'claro' ? 'oscuro' : 'claro'
    try { localStorage.setItem(clave(get().usuarioId), tema) } catch { /* sin almacenamiento: el cambio dura la sesión */ }
    set({ tema })
  },
}))
