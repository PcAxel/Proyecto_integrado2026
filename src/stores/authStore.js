import { create } from 'zustand'
import { configurarSesion } from '@/services/api'
import { authService } from '@/services/auth.service'
import { usuarioDesdeApi } from '@/domain/rolesApi'

/** Minutos de inactividad antes del cierre de sesión automático. */
export const INACTIVITY_MINUTES = 15

// Versiones anteriores guardaban los tokens en localStorage: se borran para que no queden credenciales en el navegador.
try { globalThis.localStorage?.removeItem('fyag-auth') } catch { /* sin almacenamiento */ }

/**
 * Sesión real. NADA de la sesión se guarda en el navegador:
 *  - el access token (15 min) vive solo en memoria;
 *  - el token de renovación va en una cookie HttpOnly que JavaScript no puede leer (ni robar con un XSS);
 *  - el perfil se vuelve a pedir al servidor al abrir la app (`restaurarSesion`).
 */
export const useAuthStore = create((set, get) => ({
  access: null,
  /** @type {ReturnType<typeof usuarioDesdeApi>|null} */
  user: null,
  lastActivity: Date.now(),
  /** Motivo del último cierre de sesión forzado, para mostrarlo en /login. */
  aviso: null,

  /** Guarda la sesión entregada por el paso 2 (código 2FA) o por la renovación. */
  iniciarSesion: ({ access, user }) => set({ access, user: usuarioDesdeApi(user), lastActivity: Date.now(), aviso: null }),

  /** Al abrir la app: intenta recuperar la sesión con la cookie. @returns {Promise<boolean>} */
  async restaurarSesion() {
    try {
      get().iniciarSesion(await authService.refresh())
      return true
    } catch (e) {
      if (e.status === 0) throw e // sin servidor: lo maneja el bloqueo de conexión
      return false
    }
  },

  /** Cierra la sesión también en el servidor (invalida el refresh y borra la cookie). */
  logout: (aviso = null) => {
    if (get().access || get().user) authService.logout().catch(() => {})
    set({ access: null, user: null, aviso })
  },

  /** Re-lee el perfil real desde Django. 401 cierra la sesión; un fallo de red se propaga. */
  async sincronizar() {
    const user = usuarioDesdeApi(await authService.me())
    set({ user })
    return user
  },
  /** Registra la aceptación en el backend; el estado local cambia solo si el servidor confirma. */
  async aceptarTerminos(version) {
    const user = usuarioDesdeApi(await authService.acceptTerms(version))
    set({ user })
    return user
  },

  touch: () => set({ lastActivity: Date.now() }),
  /** Cierra sesión si superó el umbral de inactividad. @returns {boolean} true si cerró. */
  checkInactivity: () => {
    const { user, lastActivity } = get()
    if (user && Date.now() - lastActivity > INACTIVITY_MINUTES * 60_000) {
      get().logout('Cerramos tu sesión por inactividad.')
      return true
    }
    return false
  },
}))

configurarSesion({
  access: () => useAuthStore.getState().access,
  guardarSesion: (s) => useAuthStore.getState().iniciarSesion(s),
  expirar: (aviso) => useAuthStore.getState().logout(aviso),
  // Falta aceptar los términos: se re-lee el perfil y el guard de rutas redirige a la pantalla de términos.
  terminosPendientes: () => useAuthStore.getState().sincronizar().catch(() => {}),
})
