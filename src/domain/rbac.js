/** @typedef {'ADMIN_GENERAL'|'ADMINISTRACION'|'BODEGA'|'SUPERVISOR'|'TECNICO'|'CONSULTA'} Rol */

export const ROLES = {
  ADMIN_GENERAL: 'ADMIN_GENERAL',
  ADMINISTRACION: 'ADMINISTRACION',
  BODEGA: 'BODEGA',
  SUPERVISOR: 'SUPERVISOR',
  TECNICO: 'TECNICO',
  CONSULTA: 'CONSULTA',
}

export const ROL_LABEL = {
  ADMIN_GENERAL: 'Administrador General',
  ADMINISTRACION: 'Administración',
  BODEGA: 'Bodega',
  SUPERVISOR: 'Supervisor de Obras',
  TECNICO: 'Técnico de Terreno',
  CONSULTA: 'Consulta (Gerencia)',
}

const ALL = Object.values(ROLES)
const OFICINA = ALL.filter((r) => r !== 'TECNICO')

/**
 * Acciones → roles autorizados. Formato "modulo.accion".
 * No existen acciones de borrado sobre entidades críticas (P1, P2).
 * @type {Record<string, Rol[]>}
 */
export const PERMISOS = {
  // Navegación por módulo
  'dashboard.ver': OFICINA,
  'presupuestos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'obras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA', 'BODEGA'],
  'bodega.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'compras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'terreno.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'personal.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'maestros.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'clientes.ver': OFICINA,
  // Bodega necesita leer proveedores para registrar compras y artículos.
  'proveedores.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'auditoria.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'pwa.usar': ['TECNICO', 'ADMIN_GENERAL'],

  // Acciones
  'costos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA', 'SUPERVISOR'],
  'costos_compra.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'presupuestos.crear': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR'],
  'presupuestos.aprobar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'obras.crear': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR'],
  'obras.cerrar': ['ADMIN_GENERAL', 'SUPERVISOR'],
  'obras.emergencia': ['ADMIN_GENERAL', 'SUPERVISOR'],
  'articulos.gestionar': ['ADMIN_GENERAL', 'BODEGA'],
  'cardex.crear': ['ADMIN_GENERAL', 'BODEGA'],
  'cardex.reversar': ['ADMIN_GENERAL', 'BODEGA'],
  'cardex.reingresar': ['ADMIN_GENERAL', 'BODEGA'],
  'compras.registrar': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA'],
  'hojas.auditar': ['ADMIN_GENERAL', 'SUPERVISOR'],
  'personal.gestionar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'maestros.gestionar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'exportar': OFICINA,
}

/**
 * @param {Rol|null|undefined} rol
 * @param {string} accion
 * @returns {boolean}
 */
export function can(rol, accion) {
  if (!rol) return false
  return (PERMISOS[accion] ?? []).includes(rol)
}

/**
 * Ruta de aterrizaje tras iniciar sesión.
 * @param {Rol} rol
 * @returns {string}
 */
export function rutaInicial(rol) {
  return rol === ROLES.TECNICO ? '/app' : '/erp'
}
