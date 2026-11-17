/** @typedef {'ADMIN_GENERAL'|'ADMINISTRACION'|'BODEGA'|'SUPERVISOR'|'TECNICO'|'CONSULTA'|'RRHH'|'SUPER_ADMIN'|'COMERCIAL'} Rol */

export const ROLES = {
  ADMIN_GENERAL: 'ADMIN_GENERAL',
  ADMINISTRACION: 'ADMINISTRACION',
  BODEGA: 'BODEGA',
  SUPERVISOR: 'SUPERVISOR',
  TECNICO: 'TECNICO',
  CONSULTA: 'CONSULTA',
  RRHH: 'RRHH',
  // Roles corporativos (se agregan al final: los anteriores conservan su código)
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMERCIAL: 'COMERCIAL',
}

export const ROL_LABEL = {
  ADMIN_GENERAL: 'Gerente General',
  ADMINISTRACION: 'Finanzas y Tributario',
  BODEGA: 'Bodega',
  SUPERVISOR: 'Operaciones y Bodega',
  TECNICO: 'Técnico en Terreno',
  CONSULTA: 'Auditor Externo',
  RRHH: 'Recursos Humanos',
  SUPER_ADMIN: 'Super Admin (TI y Seguridad)',
  COMERCIAL: 'Ejecutivo Comercial',
}

/** Qué puede hacer cada rol, en una línea; se muestra al asignarlo. */
export const ROL_DESCRIPCION = {
  ADMIN_GENERAL: 'Dirección ejecutiva: aprueba presupuestos con margen bajo, cierra obras y ve toda la gestión. Administra accesos mientras no exista un área de TI. No ejecuta tareas operativas.',
  ADMINISTRACION: 'Contabilidad y cumplimiento tributario: factura electrónica (DTE), compras, pago de finiquitos, clientes y proveedores, y auditoría. Ve el personal, pero no lo modifica.',
  BODEGA: 'Artículos, Cardex, compras y solicitudes de retiro. (Hoy lo cubre Operaciones y Bodega.)',
  SUPERVISOR: 'Obras, CU30, inventario y Cardex, recepción de compras y auditoría de hojas de terreno. No emite facturas ni toca estados financieros.',
  TECNICO: 'Solo la app de terreno: hojas de servicio, horas, reloj control y retiro de materiales.',
  CONSULTA: 'Revisión externa de solo lectura: finanzas, presupuestos, aprobaciones e indicadores. No puede modificar nada.',
  RRHH: 'Único rol que modifica personal y flota: fichas, tarifas, contratos, vehículos y vencimientos.',
  SUPER_ADMIN: 'TI y seguridad: usuarios y roles, log de auditoría técnica y estado del sistema e integraciones. No participa del negocio: no crea, aprueba ni ve costos.',
  COMERCIAL: 'Ventas: crea y simula presupuestos y gestiona la cartera de clientes. No aprueba: bajo 20 % de margen decide Gerencia.',
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
  'conteo.registrar': { tipo: 'operativa', modulo: 'Bodega', descripcion: 'Registrar conteos físicos de inventario (conteo ciego)' },
  'conteo.aprobar': { tipo: 'aprobacion', modulo: 'Bodega', descripcion: 'Aprobar o rechazar el ajuste de inventario de un conteo (siempre otra persona que quien contó)' },
  'compras.ver': { tipo: 'lectura', modulo: 'Compras', descripcion: 'Ver facturas de compra y notas de crédito' },
  'facturacion.ver': { tipo: 'lectura', modulo: 'Facturación', descripcion: 'Ver el estado de la factura electrónica de una obra y descargar su PDF' },
  'facturacion.emitir': { tipo: 'aprobacion', modulo: 'Facturación', descripcion: 'Emitir la factura electrónica (DTE, SII) de una obra finalizada y descargar su PDF' },
  'compras.registrar': { tipo: 'operativa', modulo: 'Compras', descripcion: 'Registrar facturas (hasta 3 descuentos) y notas de crédito' },
  'terreno.ver': { tipo: 'lectura', modulo: 'Auditoría de terreno', descripcion: 'Ver las hojas de servicio enviadas desde la app móvil' },
  'hojas.auditar': { tipo: 'operativa', modulo: 'Auditoría de terreno', descripcion: 'Aprobar o devolver hojas de servicio' },
  'personal.ver': { tipo: 'lectura', modulo: 'Personal y Flota', descripcion: 'Ver fichas, tarifas, vehículos y vencimientos' },
  'personal.editar': { tipo: 'operativa', modulo: 'Personal y Flota', descripcion: 'Modificar fichas, tarifas hora-hombre y estado de vehículos' },
  'rrhh.ver': { tipo: 'lectura', modulo: 'Contratos y Finiquitos', descripcion: 'Ver contratos, documentos laborales y finiquitos del personal' },
  'rrhh.gestionar': { tipo: 'operativa', modulo: 'Contratos y Finiquitos', descripcion: 'Crear contratos, subir amonestaciones y anexos, y generar finiquitos (no puede registrar su pago)' },
  'cumplimiento.ver': { tipo: 'lectura', modulo: 'Contratos y Finiquitos', descripcion: 'Ver el historial de contrataciones, las alertas legales de plazo fijo (art. 159 N°4), la rotación de personal y su informe con IA' },
  'finiquitos.ver': { tipo: 'lectura', modulo: 'Contratos y Finiquitos', descripcion: 'Ver los finiquitos por pagar y los ya pagados' },
  'finiquitos.pagar': { tipo: 'operativa', modulo: 'Contratos y Finiquitos', descripcion: 'Adjuntar el comprobante de transferencia y marcar un finiquito como pagado' },
  'maestros.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Ver el módulo de clientes y proveedores' },
  'clientes.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Consultar clientes (para presupuestos y obras)' },
  'proveedores.ver': { tipo: 'lectura', modulo: 'Clientes y Proveedores', descripcion: 'Consultar proveedores (para compras y artículos)' },
  'maestros.gestionar': { tipo: 'operativa', modulo: 'Clientes y Proveedores', descripcion: 'Crear, editar y desactivar clientes y proveedores' },
  'clientes.gestionar': { tipo: 'operativa', modulo: 'Clientes y Proveedores', descripcion: 'Crear, editar y desactivar clientes (cartera comercial), sin tocar proveedores' },
  'auditoria.ver': { tipo: 'lectura', modulo: 'Auditoría', descripcion: 'Ver el Log de Auditoría de todo el sistema' },
  'costos.ver': { tipo: 'lectura', modulo: 'Costos', descripcion: 'Ver costos de obras, mano de obra y tarifas hora-hombre' },
  'costos_compra.ver': { tipo: 'lectura', modulo: 'Costos', descripcion: 'Ver costos de compra de artículos y valor del inventario' },
  'exportar': { tipo: 'lectura', modulo: 'Exportación', descripcion: 'Exportar listados a Excel y PDF' },
  'usuarios.ver': { tipo: 'lectura', modulo: 'Accesos y Usuarios', descripcion: 'Ver los usuarios con acceso al sistema' },
  'usuarios.crear': { tipo: 'sistema', modulo: 'Accesos y Usuarios', descripcion: 'Crear accesos y asignar roles y contraseña inicial' },
  'usuarios.editar': { tipo: 'sistema', modulo: 'Accesos y Usuarios', descripcion: 'Editar usuarios, cambiar roles, restablecer claves y desactivar accesos' },
  'gobernanza_ia.ver': { tipo: 'sistema', modulo: 'Sistema', descripcion: 'Ver la trazabilidad de prompts de la IA, sus alertas de seguridad y los derechos y deberes del agente por rol' },
  'gobernanza_ia.gestionar': { tipo: 'sistema', modulo: 'Sistema', descripcion: 'Activar o desactivar lo que el agente de IA puede hacer para cada rol y su límite de acciones automáticas' },
  'sistema.ver': { tipo: 'sistema', modulo: 'Sistema', descripcion: 'Ver la salud de los servicios, las integraciones configuradas y el resumen de accesos' },
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
 * - CONSULTA (Auditor Externo) solo tiene acciones de lectura; el servidor además le rechaza todo lo que no sea GET.
 * - SUPER_ADMIN administra accesos y ve la auditoría técnica, pero no opera ni aprueba nada del negocio.
 * - COMERCIAL prepara presupuestos y clientes; nunca aprueba.
 * - RRHH es el único que modifica personal y flota, y quien genera contratos y finiquitos; Administración (Finanzas) solo registra su pago.
 * @type {Record<string, Rol[]>}
 */
export const PERMISOS = {
  // ── Lectura ──
  'dashboard.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA', 'RRHH', 'SUPER_ADMIN', 'COMERCIAL'],
  'presupuestos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA', 'COMERCIAL'],
  'obras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'bodega.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'compras.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'terreno.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA'],
  'personal.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA', 'RRHH'],
  'maestros.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA', 'COMERCIAL'],
  'clientes.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA', 'COMERCIAL'],
  // Bodega necesita leer proveedores para registrar compras y artículos.
  'proveedores.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA'],
  'auditoria.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA', 'SUPER_ADMIN'],
  'costos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'SUPERVISOR', 'CONSULTA', 'COMERCIAL'],
  'costos_compra.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA', 'COMERCIAL'],
  'exportar': ['ADMIN_GENERAL', 'ADMINISTRACION', 'BODEGA', 'SUPERVISOR', 'CONSULTA', 'COMERCIAL'],
  'usuarios.ver': ['SUPER_ADMIN', 'ADMIN_GENERAL'],
  'asistencia.ver': ['ADMIN_GENERAL', 'RRHH'],
  'rrhh.ver': ['ADMIN_GENERAL', 'RRHH'],
  'cumplimiento.ver': ['ADMIN_GENERAL', 'CONSULTA', 'RRHH'],
  'finiquitos.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],
  'facturacion.ver': ['ADMIN_GENERAL', 'ADMINISTRACION', 'CONSULTA'],

  // ── Aprobación ──
  'presupuestos.aprobar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'obras.cerrar': ['ADMIN_GENERAL', 'SUPERVISOR'],
  'conteo.aprobar': ['ADMIN_GENERAL', 'ADMINISTRACION'],
  'facturacion.emitir': ['ADMIN_GENERAL', 'ADMINISTRACION'],

  // ── Operativas ──
  'presupuestos.crear': ['ADMINISTRACION', 'SUPERVISOR', 'COMERCIAL'],
  'obras.crear': ['ADMINISTRACION', 'SUPERVISOR'],
  'obras.emergencia': ['SUPERVISOR'],
  'articulos.gestionar': ['BODEGA', 'SUPERVISOR'],
  'cardex.crear': ['BODEGA', 'SUPERVISOR'],
  'cardex.reversar': ['BODEGA', 'SUPERVISOR'],
  'cardex.reingresar': ['BODEGA', 'SUPERVISOR'],
  'conteo.registrar': ['BODEGA', 'SUPERVISOR'],
  'compras.registrar': ['ADMINISTRACION', 'BODEGA', 'SUPERVISOR'],
  'hojas.auditar': ['SUPERVISOR'],
  'personal.editar': ['RRHH'],
  'rrhh.gestionar': ['RRHH'],
  'finiquitos.pagar': ['ADMINISTRACION'],
  'maestros.gestionar': ['ADMINISTRACION'],
  'clientes.gestionar': ['COMERCIAL'],
  'pwa.usar': ['TECNICO'],
  'asistencia.marcar': ['TECNICO'],

  // ── Sistema: lo administra TI (Super Admin). La Gerencia General lo conserva mientras la empresa no tenga área de TI:
  //    así ninguna instalación existente se queda sin quien cree accesos. Para la segregación estricta basta quitar ADMIN_GENERAL de estas tres. ──
  'usuarios.crear': ['SUPER_ADMIN', 'ADMIN_GENERAL'],
  'usuarios.editar': ['SUPER_ADMIN', 'ADMIN_GENERAL'],
  'sistema.ver': ['SUPER_ADMIN'],
  'gobernanza_ia.ver': ['SUPER_ADMIN', 'ADMIN_GENERAL'],
  'gobernanza_ia.gestionar': ['SUPER_ADMIN'],
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
