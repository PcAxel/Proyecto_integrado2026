/**
 * Reglas de acceso al flujo de instalación de la PWA. Funciones puras: la fuente de verdad es
 * `terms_accepted_at` que entrega el backend (Django) en `/api/auth/me/`.
 */
export const RUTAS_INSTALAR = { login: '/instalar', terminos: '/instalar/terminos', descarga: '/instalar/descarga' }

/** ¿Aceptó los términos? Solo cuenta un `terms_accepted_at` no nulo. */
export const terminosAceptados = (user) => Boolean(user?.terms_accepted_at)

/**
 * ¿Debe pasar por los términos? Solo el Técnico, que usa la app instalada en su celular.
 * El resto de los roles trabaja en el ERP del navegador y no tiene que aceptar nada para entrar.
 */
export const terminosPendientes = (user) => {
  if (user?.rolApi && user.rolApi !== 'TECNICO') return false
  return !terminosAceptados(user)
}

/** Pantalla que le corresponde al estado de la sesión. */
export function rutaPorEstado(session) {
  if (!session?.access || !session?.user) return RUTAS_INSTALAR.login
  return terminosPendientes(session.user) ? RUTAS_INSTALAR.terminos : RUTAS_INSTALAR.descarga
}

/**
 * Guard de ruta: devuelve la ruta a la que hay que redirigir, o null si puede quedarse.
 * @param {'sesion'|'terminos'} nivel `sesion`: basta con iniciar sesión; `terminos`: además haber aceptado.
 */
export function redireccionRequerida(session, nivel) {
  const destino = rutaPorEstado(session)
  if (destino === RUTAS_INSTALAR.login) return destino
  if (nivel === 'terminos' && destino !== RUTAS_INSTALAR.descarga) return destino
  return null
}
