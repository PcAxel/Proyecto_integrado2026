import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { almacenamiento } from './storage'
import { USUARIOS_DEMO } from '@/mocks/usuarios'

/** Minutos de inactividad antes del cierre de sesión automático. */
export const INACTIVITY_MINUTES = 15

/**
 * Token JWT simulado (header.payload.firma) con la misma forma que SimpleJWT.
 * @param {{id:string, rol:string}} user
 */
function fakeJwt(user) {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + INACTIVITY_MINUTES * 60
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, rol: user.rol, exp })}.demo`
}

/**
 * @typedef {{id:string, nombre:string, rol:import('@/domain/rbac').Rol, cargo:string, email:string}} Usuario
 */

export const useAuthStore = create(
  persist(
    (set, get) => ({
      /** @type {Usuario|null} */
      user: null,
      token: null,
      lastActivity: Date.now(),
      /** IP simulada que se registra en LogAuditoria. */
      ip: '192.168.10.24',

      /** @param {string} userId */
      login: (userId) => {
        const user = USUARIOS_DEMO.find((u) => u.id === userId)
        if (!user) return null
        set({ user, token: fakeJwt(user), lastActivity: Date.now() })
        return user
      },
      logout: () => set({ user: null, token: null }),
      /** Modo demo: cambia de rol sin pasar por el login. */
      switchRole: (userId) => get().login(userId),
      touch: () => set({ lastActivity: Date.now() }),
      /** Cierra sesión si superó el umbral de inactividad. @returns {boolean} true si cerró. */
      checkInactivity: () => {
        const { user, lastActivity } = get()
        if (user && Date.now() - lastActivity > INACTIVITY_MINUTES * 60_000) {
          set({ user: null, token: null })
          return true
        }
        return false
      },
    }),
    { name: 'fyag-auth', storage: almacenamiento, partialize: (s) => ({ user: s.user, token: s.token, lastActivity: s.lastActivity }) },
  ),
)
