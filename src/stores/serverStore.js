import { create } from 'zustand'

export const MENSAJE_SIN_CONEXION = 'Error de conexión con el servidor central de FYAG'

/** Estado del servidor central: mientras esté caído, ninguna pantalla de la app es accesible. */
export const useServerStore = create((set) => ({
  caido: false,
  /** Mensaje de un 403 del servidor; bloquea la vista actual hasta que el usuario lo cierre. */
  denegado: null,
  marcarCaido: () => set({ caido: true }),
  marcarOk: () => set({ caido: false }),
  denegar: (mensaje) => set({ denegado: mensaje }),
  limpiarDenegado: () => set({ denegado: null }),
}))
