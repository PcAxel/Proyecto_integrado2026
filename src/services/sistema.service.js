import { api } from './api'

/** Panel técnico de TI (Super Admin). El servidor nunca entrega claves ni direcciones: de cada integración solo dice si está configurada. */
export const sistemaService = {
  /** @returns {Promise<{servicios:Record<string,'ok'|'fallo'>, integraciones:{ia:boolean, correo:boolean, dte_proveedor:string}, accesos:{activos:number, inactivos:number, bloqueados:number, sin_2fa:number, por_rol:Record<string,number>}, entorno:{debug:boolean, version_terminos:string}}>} */
  estado: () => api.get('/sistema/estado/'),
  /** Envía un correo de prueba y, si falla, dice por qué (clave de Brevo, remitente sin verificar, IP no autorizada…). @returns {Promise<{ok:boolean, motivo:string, remitente:string}>} */
  probarCorreo: (destinatario) => api.post('/sistema/probar-correo/', { destinatario }),
}
