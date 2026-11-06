import { USUARIOS_DEMO } from '@/mocks/usuarios'
import { useAuthStore } from '@/stores/authStore'

/** Solo para pruebas: deja iniciada una sesión como uno de los usuarios de ejemplo, sin pasar por el servidor. */
export function entrarComo(id) {
  const u = USUARIOS_DEMO.find((x) => x.id === id)
  if (!u) throw new Error(`Usuario de ejemplo desconocido: ${id}`)
  const user = { ...u, rolApi: null, terms_accepted_at: '2026-10-01T00:00:00', first_name: u.nombre.split(' ')[0] }
  useAuthStore.setState({ user, access: 'test', refresh: 'test' })
  return user
}
