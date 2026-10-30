/** @typedef {'ADMIN_GENERAL'|'ADMINISTRACION'|'BODEGA'|'SUPERVISOR'|'TECNICO'|'CONSULTA'|'RRHH'} Rol */

export const ROLES = {
  ADMIN_GENERAL: 'ADMIN_GENERAL',
  ADMINISTRACION: 'ADMINISTRACION',
  BODEGA: 'BODEGA',
  SUPERVISOR: 'SUPERVISOR',
  TECNICO: 'TECNICO',
  CONSULTA: 'CONSULTA',
  RRHH: 'RRHH',
}

export const ROL_LABEL = {
  ADMIN_GENERAL: 'Administrador General',
  ADMINISTRACION: 'Administración',
  BODEGA: 'Bodega',
  SUPERVISOR: 'Supervisor de Obras',
  TECNICO: 'Técnico de Terreno',
  CONSULTA: 'Consulta (Gerencia)',
  RRHH: 'Recursos Humanos',
}

/** Qué puede hacer cada rol, en una línea; se muestra al asignarlo. */
export const ROL_DESCRIPCION = {
  ADMIN_GENERAL: 'Autoriza y supervisa: aprueba presupuestos con margen bajo, cierra obras, ve toda la gestión y administra los accesos. No ejecuta tareas operativas.',
  ADMINISTRACION: 'Presupuestos, compras, clientes y proveedores, y auditoría. Ve el personal, pero no lo modifica.',
  BODEGA: 'Artículos, Cardex, compras y solicitudes de retiro.',
  SUPERVISOR: 'Obras, CU30, auditoría de hojas de terreno y presupuestos.',
  TECNICO: 'Solo la app de terreno: hojas de servicio y retiro de materiales.',
  CONSULTA: 'Solo lectura de la información de gestión. No puede modificar nada.',
  RRHH: 'Único rol que modifica personal y flota: fichas, tarifas, vehículos y vencimientos.',
}

/**
 * Clases de acción, base de la segregación de funciones:
 * - lectura: ver o exportar información.
 * - aprobacion: autorizar lo que otro preparó.
 * - operativa: ejecutar el trabajo diario (registrar, crear, corregir).
 * - sistema: administrar los accesos al sistema.
 */
export const TIPOS_ACCION = ['lectura', 'aprobacion', 'operativa', 'sistema']

/**
 * Catálogo de acciones: cada permiso declara su clase y qué permite. Toda clave de PERMISOS debe estar aquí
 * (una prueba lo exige); es la fuente de la matriz de permisos documentada.
 * @type {Record<string, {tipo: 'lectura'|'aprobacion'|'operativa'|'sistema', modulo: string, descripcion: string}>}
 */
export const CATALOGO_PERMISOS = {
  'dashboard.ver': { tipo: 'lectura', modulo: 'Dashboard', descripcion: 'Ver el tablero de indicadores (cada rol ve solo los de su ámbito)' },
  'presupuestos.ver': { tipo: 'lectura', modulo: 'Presupuestos', descripcion: 'Ver presupuestos y su simulación de rentabilidad' },
  'presupuestos.crear': { tipo: 'operativa', modulo: 'Presupuestos', descripcion: 'Crear y editar presupuestos en borrador o enviados' },
  'presupuestos.aprobar': { tipo: 'aprobacion', modulo: 'Presupuestos', descripcion: 'Aprobar o rechazar presupuestos (con margen < 20 % solo el Administrador General)' },
  'obras.ver': { tipo: 'lectura', modulo: 'Obras', descripcion: 'Ver obras y su panel de cierre' },
  'obras.crear': { tipo: 'operativa', modulo: 'Obras', descripcion: 'Crear, iniciar y regularizar obras' },
  'obras.emergencia': { tipo: 'operativa', modulo: 'Obras', descripcion: 'Abrir obras de emergencia o garantía sin presupuesto previo (CU30)' },
  'obras.cerrar': { tipo: 'aprobacion', modulo: 'Obras', descripcion: 'Finalizar una obra que cumple los 6 requisitos de cierre' },
  'bodega.ver': { tipo: 'lectura', modulo: 'Bodega', descripcion: 'Ver artículos, stock, Cardex y solicitudes de retiro' },
  'articulos.gestionar': { tipo: 'operativa', modulo: 'Bodega', descripcion: 'Crear, editar y desactivar artículos' },
  'cardex.crear': { tipo: 'operativa', modulo: 'Bodega', descripcion: 'Registrar salidas a obra y entregar solicitudes de retiro' },
  'cardex.reversar': { tipo: 'operativa', modulo: 'Bodega', descripcion: 'Reversar un movimiento del Cardex (contra-asiento auditado)' },
  'cardex.reingresar': { tipo: 'operativa', modulo: 'Bodega', descripcion: 'Reingresar sobrantes y conciliarlos' },
  'compras.ver': { tipo: 'lectura', modulo: 'Compras', descripcion: 'Ver facturas de compra y notas de crédito' },
  'compras.registrar': { tipo: 'operativa', modulo: 'Compras', descripcion: 'Registrar facturas (hasta 3 descuentos) y notas de crédito' },
  'terreno.ver': { tipo: 'lectura', modulo: 'Auditoría de terreno', descripcion: 'Ver las hojas de servicio enviadas desde la app móvil' },
  'hojas.auditar': { tipo: 'operativa', modulo: 'Auditoría de terreno', descripcion: 'Aprobar o devolver hojas de servicio' },
  'personal.ver': { tipo: 'lectura', modulo: 'Personal y Flota', descripcion: 'Ver fichas, tarifas, vehículos y vencimientos' },
  'personal.editar': { tipo: 'operativa', modulo: 'Personal y Flota', descripcion: 'Modificar fichas, tarifas hora-hombre y estado de vehículos' },
  'maestros.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Ver el módulo de clientes y proveedores' },
  'clientes.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Consultar clientes (para presupuestos y obras)' },
  'proveedores.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Consultar proveedores (para compras y artículos)' },
  'maestros.gestionar': { tipo: 'operativa', modulo: 'Clientes y Proveedores', descripcion: 'Crear, editar y desactivar clientes y proveedores' },
  'auditoria.ver': { tipo: 'lectura', modulo: 'Auditoría', descripcion: 'Ver el Log de Auditoría de todo el sistema' },
  'costos.ver': { tipo: 'lectura', modulo: 'Costos', descripcion: 'Ver costos de obras, mano de obra y tarifas hora-hombre' },
  'costos_compra.ver': { tipo: 'lectura', modulo: 'Costos', descripcion: 'Ver costos de compra de artículos y valor del inventario' },
  'exportar': { tipo: 'lectura', modulo: 'Exportación', descripcion: 'Exportar listados a Excel y PDF' },
  'usuarios.ver': { tipo: 'lectura', modulo: 'Accesos y Usuarios', descripcion: 'Ver los usuarios con acceso al sistema' },
  'usuarios.crear': { tipo: 'sistema', modulo: 'Accesos y Usuarios', descripcion: 'Crear accesos y asignar roles y contraseña inicial' },
  'usuarios.editar': { tipo: 'sistema', modulo: 'Accesos y Usuarios', descripcion: 'Editar usuarios, cambiar roles, restablecer claves y desactivar accesos' },
  'asistencia.marcar': { tipo: 'operativa', modulo: 'App de terreno', descripcion: 'Marcar entrada y salida en el reloj control desde la app móvil' },
  'asistencia.ver': { tipo: 'lectura', modulo: 'Personal y Flota', descripcion: 'Ver la asistencia diaria de los técnicos (hora de entrada, salida y ubicación)' },
  'pwa.usar': { tipo: 'operativa', modulo: 'App de terreno', descripcion: 'Usar la app móvil: hojas de servicio y solicitudes de retiro' },
}

/**
 * Acciones → roles autorizados. Formato "modulo.accion".
 * Toda lista es EXPLÍCITA: no hay conjuntos derivados, así que un rol nuevo no hereda nada por defecto.
 * No existen acciones de borrado sobre entidades críticas (P1, P2).
 *
 * Segregación de funciones:
 * - ADMIN_GENERAL autoriza y administra accesos, pero no ejecuta tareas operativas.
 * - CONSULTA solo tiene acciones de lectura.
 * - RRHH es el único que modifica personal y flota.
 * @type {Record<string, Rol[]>}
 */
export const PERMISOS = {
  // ── Lectura ──
  'dashboard.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA', 'RRHH'],
  'presupuestos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'obras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'bodega.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'compras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'terreno.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'personal.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA', 'RRHH'],
  'maestros.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'clientes.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  // Bodega necesita leer proveedores para registrar compras y artículos.
  'proveedores.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'auditoria.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'costos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'costos_compra.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'CONSULTA'],
  'exportar': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'usuarios.ver': ['ADMIN_GENERAL'],
  'asistencia.ver': ['ADMIN_GENERAL', 'RRHH'],

  // ── Aprobación ──
  'presupuestos.aprobar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'obras.cerrar': ['ADMIN_GENERAL', 'SUPERVISOR'],

  // ── Operativas ──
  'presupuestos.crear': ['ADMINISTRACION', 'SUPERVISOR'],
  'obras.crear': ['ADMINISTRACION', 'SUPERVISOR'],
  'obras.emergencia': ['SUPERVISOR'],
  'articulos.gestionar': ['BODEGA'],
  'cardex.crear': ['BODEGA'],
  'cardex.reversar': ['BODEGA'],
  'cardex.reingresar': ['BODEGA'],
  'compras.registrar': ['ADMINISTRACION', 'BODEGA'],
  'hojas.auditar': ['SUPERVISOR'],
  'personal.editar': ['RRHH'],
  'maestros.gestionar': ['ADMINISTRACION'],
  'pwa.usar': ['TECNICO'],
  'asistencia.marcar': ['TECNICO'],

  // ── Sistema: la empresa no tiene área de TI, así que solo la Gerencia General administra usuarios ──
  'usuarios.crear': ['ADMIN_GENERAL'],
  'usuarios.editar': ['ADMIN_GENERAL'],
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

/** Acciones que un rol tiene, opcionalmente filtradas por clase. @param {Rol} rol @param {string} [tipo] */
export function permisosDe(rol, tipo) {
  return Object.keys(PERMISOS).filter((a) => PERMISOS[a].includes(rol) && (!tipo || CATALOGO_PERMISOS[a]?.tipo === tipo))
}

/**
 * Ruta de aterrizaje tras iniciar sesión.
 * @param {Rol} rol
 * @returns {string}
 */
export function rutaInicial(rol) {
  return rol === ROLES.TECNICO ? '/app' : '/erp'
}
