import { api } from './api'

/** Usuarios del sistema: viven en Django (con su contraseña y 2FA), no en las tablas del ERP. */
export const usuariosService = {
  list: () => api.get('/users/'),
  /** Crea el acceso; el servidor genera la contraseña temporal y la envía por correo. */
  create: (data) => api.post('/users/', data),
}
