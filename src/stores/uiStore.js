import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { almacenamiento } from './storage'

export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      /** Filtros persistidos por vista: { [vista]: objeto } */
      filtros: {},
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
      setFiltros: (vista, valor) => set((s) => ({ filtros: { ...s.filtros, [vista]: valor } })),
    }),
    { name: 'fyag-ui', storage: almacenamiento, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, filtros: s.filtros }) },
  ),
)
