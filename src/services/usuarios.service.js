import { api } from './api'

/** Usuarios del sistema: viven en Django (con su contraseña y 2FA), no en las tablas del ERP. */
export const usuariosService = {
  list: () => api.get('/users/'),
  /** Crea el acceso. `password` (opcional) la fija quien administra; si no, el servidor genera una. Devuelve `password_temporal` UNA vez, aunque el correo falle. */
  create: (data) => api.post('/users/', data),
  /** Solo TI: fija (o genera) una contraseña temporal nueva para otra cuenta, cierra sus sesiones y quita su bloqueo por intentos. Devuelve `password_temporal` una vez. */
  restablecerClave: (id, data) => api.post(`/users/${id}/password/`, data),
  /** Cambia el nombre o el rol. El servidor impide cambiar el rol propio y cierra las sesiones de quien cambió de rol. */
  update: (id, data) => api.patch(`/users/${id}/`, data),
  /** Borrado lógico: la cuenta pierde el acceso y se conserva su historial. No existe «eliminar usuario». */
  desactivar: (id) => api.post(`/users/${id}/desactivar/`, {}),
  reactivar: (id) => api.post(`/users/${id}/reactivar/`, {}),
}
