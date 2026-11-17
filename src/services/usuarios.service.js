import { api } from './api'

/** Usuarios del sistema: viven en Django (con su contraseña y 2FA), no en las tablas del ERP. */
export const usuariosService = {
  list: () => api.get('/users/'),
  /** Crea el acceso; el servidor genera la contraseña temporal y la envía por correo. */
  create: (data) => api.post('/users/', data),
  /** Cambia el nombre o el rol. El servidor impide cambiar el rol propio y cierra las sesiones de quien cambió de rol. */
  update: (id, data) => api.patch(`/users/${id}/`, data),
  /** Borrado lógico: la cuenta pierde el acceso y se conserva su historial. No existe «eliminar usuario». */
  desactivar: (id) => api.post(`/users/${id}/desactivar/`, {}),
  reactivar: (id) => api.post(`/users/${id}/reactivar/`, {}),
}
