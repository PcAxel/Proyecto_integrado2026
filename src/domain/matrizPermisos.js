import { ROLES, ROL_LABEL, ROL_DESCRIPCION, PERMISOS, CATALOGO_PERMISOS, permisosDe, TIPOS_ACCION } from './rbac.js'

const ABREV = { ADMIN_GENERAL: 'Gerente Gral.', ADMINISTRACION: 'Finanzas', BODEGA: 'Bodega', SUPERVISOR: 'Operaciones', TECNICO: 'Técnico', CONSULTA: 'Auditor', RRHH: 'RRHH', SUPER_ADMIN: 'Super Admin', COMERCIAL: 'Comercial' }
/** Quiénes pueden administrar accesos: TI y, mientras no exista área de TI, la Gerencia General. */
const GESTORES = ['SUPER_ADMIN', 'ADMIN_GENERAL']
const dentroDe = (roles, permitidos) => roles.length > 0 && roles.every((x) => permitidos.includes(x))
const ROLES_ORDEN = Object.values(ROLES)
const TIPO_LABEL = { lectura: 'Lectura', aprobacion: 'Aprobación', operativa: 'Operativa', sistema: 'Sistema' }

const iguales = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

/**
 * Comprueba las reglas de segregación de funciones sobre PERMISOS. La usan el documento y las pruebas:
 * si alguien amplía un permiso de forma indebida, una regla pasa a «no cumple».
 * @returns {Array<{id:string, regla:string, cumple:boolean, detalle:string}>}
 */
export function verificarSegregacion() {
  const usuarios = Object.keys(PERMISOS).filter((a) => a.startsWith('usuarios.'))
  const sistema = Object.keys(PERMISOS).filter((a) => CATALOGO_PERMISOS[a]?.tipo === 'sistema')
  const opAdmin = permisosDe(ROLES.ADMIN_GENERAL, 'operativa')
  const consulta = permisosDe(ROLES.CONSULTA)
  const negocioSuper = permisosDe(ROLES.SUPER_ADMIN).filter((a) => !['dashboard.ver', 'auditoria.ver'].includes(a) && CATALOGO_PERMISOS[a]?.tipo !== 'sistema' && !a.startsWith('usuarios.'))
  const noLectura = consulta.filter((a) => CATALOGO_PERMISOS[a]?.tipo !== 'lectura')
  const rrhh = permisosDe(ROLES.RRHH)
  const rrhhEsperado = ['asistencia.ver', 'cumplimiento.ver', 'dashboard.ver', 'personal.editar', 'personal.ver', 'rrhh.gestionar', 'rrhh.ver']
  const sinCatalogo = Object.keys(PERMISOS).filter((a) => !CATALOGO_PERMISOS[a])
  const rolesInvalidos = Object.entries(PERMISOS).flatMap(([a, roles]) => roles.filter((r) => !ROLES_ORDEN.includes(r)).map((r) => `${a}:${r}`))
  const borrado = Object.keys(PERMISOS).filter((a) => /eliminar|borrar|delete|remove|destroy/i.test(a))

  const r = (id, regla, cumple, detalleOk, detalleMal) => ({ id, regla, cumple, detalle: cumple ? detalleOk : detalleMal })
  return [
    r('usuarios-exclusivo', 'Solo TI (Super Admin) y la Gerencia General gestionan usuarios', usuarios.length === 3 && usuarios.every((a) => dentroDe(PERMISOS[a], GESTORES) && PERMISOS[a].includes('SUPER_ADMIN')),
      `usuarios.ver, usuarios.crear y usuarios.editar son solo del Super Admin y del Gerente General`, `Hay roles ajenos en: ${usuarios.filter((a) => !dentroDe(PERMISOS[a], GESTORES)).join(', ')}`),
    r('sistema-exclusivo', 'Toda acción de administración del sistema es de TI (Super Admin) o de la Gerencia General', sistema.length > 0 && sistema.every((a) => dentroDe(PERMISOS[a], GESTORES)),
      `${sistema.length} acciones de clase «sistema»`, 'Una acción de sistema tiene otros roles'),
    r('superadmin-fuera-del-negocio', 'El Super Admin no opera ni aprueba nada del negocio, ni ve costos', negocioSuper.length === 0,
      'Solo accesos, auditoría técnica y estado del sistema', `Tiene acciones de negocio: ${negocioSuper.join(', ')}`),
    r('comercial-no-aprueba', 'El Ejecutivo Comercial prepara presupuestos y clientes, pero no aprueba', permisosDe(ROLES.COMERCIAL, 'aprobacion').length === 0 && iguales(permisosDe(ROLES.COMERCIAL, 'operativa'), ['clientes.gestionar', 'presupuestos.crear']),
      'Operativas: presupuestos.crear y clientes.gestionar; 0 aprobaciones', `Operativas: ${permisosDe(ROLES.COMERCIAL, 'operativa').join(', ')} · aprobaciones: ${permisosDe(ROLES.COMERCIAL, 'aprobacion').join(', ')}`),
    r('operaciones-sin-finanzas', 'Operaciones y Bodega no emite facturas ni paga', ['facturacion.emitir', 'finiquitos.pagar', 'presupuestos.aprobar'].every((a) => !PERMISOS[a].includes(ROLES.SUPERVISOR) && !PERMISOS[a].includes(ROLES.BODEGA)),
      'Sin facturacion.emitir, finiquitos.pagar ni presupuestos.aprobar', 'Operaciones tiene una acción financiera'),
    r('admin-no-ejecuta', 'El Gerente General no ejecuta tareas operativas', opAdmin.length === 0,
      'Tiene 0 acciones operativas: solo lectura, aprobación y sistema', `Conserva acciones operativas: ${opAdmin.join(', ')}`),
    r('admin-autoriza', 'El Gerente General conserva la autorización (margen < 20 % y cierre de obras)',
      ['presupuestos.aprobar', 'obras.cerrar'].every((a) => PERMISOS[a].includes(ROLES.ADMIN_GENERAL)), 'Puede aprobar presupuestos y finalizar obras', 'Perdió una aprobación que exige la regla de negocio'),
    r('consulta-lectura', 'El Auditor Externo es estrictamente solo lectura', consulta.length > 0 && noLectura.length === 0,
      `${consulta.length} permisos y todos son de lectura`, `Tiene permisos que no son de lectura: ${noLectura.join(', ')}`),
    r('rrhh-solo-personal', 'RRHH controla únicamente Personal y Flota, contratos y finiquitos', iguales(rrhh, rrhhEsperado),
      `Solo ${rrhhEsperado.join(', ')}`, `Permisos de RRHH: ${rrhh.join(', ')}`),
    r('personal-exclusivo', 'Solo RRHH modifica el personal y la flota (personal.editar)', iguales(PERMISOS['personal.editar'], ['RRHH']),
      'Finanzas y el Gerente General ya no lo modifican', `personal.editar tiene: ${PERMISOS['personal.editar'].join(', ')}`),
    r('finiquito-segregado', 'Quien genera el finiquito (RRHH) no lo paga, y quien lo paga (Administración) no lo genera',
      iguales(PERMISOS['rrhh.gestionar'], ['RRHH']) && iguales(PERMISOS['finiquitos.pagar'], ['ADMINISTRACION']),
      'rrhh.gestionar es de RRHH y finiquitos.pagar es de Administración', `rrhh.gestionar: ${PERMISOS['rrhh.gestionar'].join(', ')} · finiquitos.pagar: ${PERMISOS['finiquitos.pagar'].join(', ')}`),
    r('tecnico-solo-app', 'El Técnico solo usa la app de terreno', iguales(permisosDe(ROLES.TECNICO), ['asistencia.marcar', 'pwa.usar']), 'Solo pwa.usar y asistencia.marcar (reloj control)', `Permisos del Técnico: ${permisosDe(ROLES.TECNICO).join(', ')}`),
    r('catalogo-completo', 'Toda acción está catalogada y solo nombra roles existentes', sinCatalogo.length === 0 && rolesInvalidos.length === 0,
      `${Object.keys(PERMISOS).length} acciones catalogadas`, `Sin catálogo: ${sinCatalogo.join(', ')} · roles inválidos: ${rolesInvalidos.join(', ')}`),
    r('sin-borrado', 'Ninguna acción permite borrar (Cardex y entidades críticas inmutables)', borrado.length === 0, 'No existen acciones de eliminación', `Acciones de borrado: ${borrado.join(', ')}`),
  ]
}

/** Riesgos de segregación que se dejaron como están (no estaban en el alcance). Se documentan para decidirlos aparte. */
export const OBSERVACIONES = [
  '**Administración crea y aprueba presupuestos** (`presupuestos.crear` y `presupuestos.aprobar`): preparador y aprobador son el mismo rol. Se mitiga porque los de margen < 20 % solo los aprueba el Administrador General.',
  '**Bodega crea y también reversa o reingresa movimientos del Cardex.** Cada reversa exige motivo y queda auditada, pero no la autoriza otro rol.',
  '**Supervisor crea obras, las cierra y audita las hojas de sus técnicos.** Es la combinación más amplia fuera de la Gerencia; si se quiere separar, `obras.cerrar` o `hojas.auditar` pasarían a otro rol.',
  '**Administración y Bodega registran compras** sin una aprobación posterior de otro rol.',
  '**Administración ve las tarifas y fichas del personal** (`personal.ver`) para costear presupuestos, pero ya no las modifica.',
  '**La Gerencia General también administra accesos** (`usuarios.*`), además de aprobar. Se conserva para que ninguna instalación quede sin quien cree usuarios; con un Super Admin activo, la segregación estricta es quitar `ADMIN_GENERAL` de esas tres acciones.',
  '**La Gerencia General y Finanzas emiten la factura electrónica** (`facturacion.emitir`). En una segregación estricta la emisión sería solo de Finanzas y Tributario.',
  '**Finanzas y Operaciones siguen pudiendo crear presupuestos**, aunque ahora existe el Ejecutivo Comercial. Se dejó así para no cortar el flujo actual.',
]

/** Documento Markdown de la matriz de permisos. Determinista: no incluye fechas, así que puede compararse con el archivo guardado. */
export function generarMatrizMarkdown() {
  const L = []
  const ok = (rol, accion) => (PERMISOS[accion].includes(rol) ? '✅' : '—')
  const acciones = Object.keys(CATALOGO_PERMISOS)

  L.push('# Matriz de permisos y segregación de funciones', '')
  L.push('> Documento **generado** desde `src/domain/rbac.js` (`PERMISOS` y `CATALOGO_PERMISOS`). No se edita a mano: ejecuta `npm run docs:permisos`.')
  L.push('> Una prueba automática falla si este archivo no coincide con el código.', '')

  L.push('## 1. Roles', '')
  L.push('| Rol | Código | Qué hace | Lectura | Aprobación | Operativas | Sistema |', '| --- | --- | --- | :-: | :-: | :-: | :-: |')
  for (const rol of ROLES_ORDEN) {
    L.push(`| **${ROL_LABEL[rol]}** | \`${rol}\` | ${ROL_DESCRIPCION[rol]} | ${TIPOS_ACCION.map((t) => permisosDe(rol, t).length).join(' | ')} |`)
  }
  L.push('', 'Las cifras son la cantidad de permisos de cada clase que tiene el rol.', '')

  L.push('## 2. Matriz de permisos', '')
  L.push('✅ permitido · — sin permiso. Clases: **Lectura** (ver o exportar), **Aprobación** (autorizar lo que otro preparó), **Operativa** (ejecutar el trabajo diario) y **Sistema** (administrar accesos).', '')
  L.push(`| Módulo | Permiso | Clase | Qué permite | ${ROLES_ORDEN.map((r) => ABREV[r]).join(' | ')} |`)
  L.push(`| --- | --- | --- | --- | ${ROLES_ORDEN.map(() => ':-:').join(' | ')} |`)
  const orden = [...new Set(acciones.map((a) => CATALOGO_PERMISOS[a].modulo))]
  for (const modulo of orden) {
    for (const a of acciones.filter((x) => CATALOGO_PERMISOS[x].modulo === modulo)) {
      const c = CATALOGO_PERMISOS[a]
      L.push(`| ${modulo} | \`${a}\` | ${TIPO_LABEL[c.tipo]} | ${c.descripcion} | ${ROLES_ORDEN.map((r) => ok(r, a)).join(' | ')} |`)
    }
  }
  L.push('')

  L.push('## 3. Verificación de segregación de funciones', '')
  L.push('| | Regla | Resultado |', '| :-: | --- | --- |')
  for (const v of verificarSegregacion()) L.push(`| ${v.cumple ? '✅' : '❌'} | ${v.regla} | ${v.detalle} |`)
  L.push('')

  L.push('## 4. Observaciones (sin cambios)', '')
  L.push('Solapamientos que existen hoy, pero que no corresponden a las tres reglas verificadas arriba. Se dejan documentados para decidirlos por separado:', '')
  for (const o of OBSERVACIONES) L.push(`- ${o}`)
  L.push('')

  L.push('## 5. Reglas de negocio que complementan los permisos', '')
  L.push('- Un presupuesto con **margen < 20 %** solo lo aprueba el Gerente General, aunque Finanzas tenga `presupuestos.aprobar` (`domain/rentabilidad.js`).')
  L.push('- El **Técnico** solo ve las obras en las que está asignado y nunca ve costos.')
  L.push('- Los **costos** se ocultan en los servicios a quien no tiene `costos.ver` o `costos_compra.ver`.')
  L.push('- Un acceso no se elimina: se desactiva. No se puede desactivar el propio acceso ni dejar al sistema sin un Gerente General activo.')
  L.push('- El **Auditor Externo** solo puede hacer lecturas: el servidor rechaza con 403 cualquier petición suya que no sea `GET` (`accounts/authentication.py`), sin depender de esta matriz.')
  L.push('')
  return L.join('\n')
}
