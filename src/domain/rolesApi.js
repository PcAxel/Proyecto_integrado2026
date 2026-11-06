/**
 * Roles del backend (Django) → roles de la matriz de permisos del frontend (`rbac.js`).
 * El backend es la fuente de verdad del rol; el frontend solo lo traduce para mostrar u ocultar menús
 * (cada endpoint vuelve a validar el permiso en el servidor).
 */
export const ROLES_API = { ADMIN: 'ADMIN', FINANZAS: 'FINANZAS', OPERACIONES: 'OPERACIONES', TECNICO: 'TECNICO', RRHH: 'RRHH' }

const A_ROL_UI = { ADMIN: 'ADMIN_GENERAL', FINANZAS: 'ADMINISTRACION', OPERACIONES: 'SUPERVISOR', TECNICO: 'TECNICO', RRHH: 'RRHH' }

/** Rol de la matriz de permisos para un rol del backend; desconocido → null (sin acceso). */
export const rolUiDesdeApi = (rolApi) => A_ROL_UI[rolApi] ?? null

/** Ruta de inicio de un rol del backend. El técnico solo existe en la app de terreno. */
export const inicioDeRolApi = (rolApi) => (rolApi === ROLES_API.TECNICO ? '/app' : '/erp')

/**
 * Perfil de la sesión a partir de /api/auth/me/ o del paso 2FA.
 * @param {{id:number, email:string, first_name?:string, last_name?:string, role:string, role_label?:string, terms_accepted_at?:string|null}} api
 */
export function usuarioDesdeApi(api) {
  const nombre = `${api.first_name ?? ''} ${api.last_name ?? ''}`.trim() || api.email
  return {
    id: `U-${String(api.id).padStart(3, '0')}`, // mismo formato que el id de usuario en las tablas del ERP
    pk: api.id,
    email: api.email,
    nombre,
    cargo: api.role_label ?? '',
    rolApi: api.role,
    rol: rolUiDesdeApi(api.role),
    terms_accepted_at: api.terms_accepted_at ?? null,
    first_name: api.first_name ?? '',
  }
}
