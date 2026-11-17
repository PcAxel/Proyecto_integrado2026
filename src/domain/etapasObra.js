/**
 * Etapas del flujo de una obra entre áreas (las fija el servidor):
 * CREADO → ASIGNADO_A_TERRENO (Jefe de Operaciones delega) → EN_EJECUCION (primera hoja de terreno)
 * → AUDITORIA_TERRENO_OK (Jefe de Operaciones audita; avisa a Finanzas) → FACTURADO (factura aceptada) → PAGADA (el cliente pagó el total).
 * `estado` (PLANIFICADA / EN_CURSO / FINALIZADA) sigue siendo el ciclo operativo; las obras anteriores al flujo no traen `etapa` y se deduce de su estado.
 */
export const ETAPAS = ['CREADO', 'ASIGNADO_A_TERRENO', 'EN_EJECUCION', 'AUDITORIA_TERRENO_OK', 'FACTURADO', 'PAGADA']

export const ETAPA_LABEL = {
  CREADO: 'Creado',
  ASIGNADO_A_TERRENO: 'Asignado a terreno',
  EN_EJECUCION: 'En ejecución',
  AUDITORIA_TERRENO_OK: 'Auditoría de terreno OK',
  FACTURADO: 'Facturado',
  PAGADA: 'Pagada',
}

const POR_ESTADO = { PLANIFICADA: 'CREADO', EN_CURSO: 'EN_EJECUCION', FINALIZADA: 'AUDITORIA_TERRENO_OK' }

/** @param {{etapa?:string, estado?:string}} obra */
export const etapaDe = (obra) => (ETAPAS.includes(obra?.etapa) ? obra.etapa : POR_ESTADO[obra?.estado] ?? 'CREADO')

/** ¿Se puede delegar a terreno? Mientras la obra no esté finalizada. */
export const puedeDelegar = (obra) => obra?.estado !== 'FINALIZADA'

/** ¿Se puede dar la auditoría de terreno OK? Obra en curso y ya delegada a terreno. */
export const puedeAuditar = (obra) => obra?.estado === 'EN_CURSO' && ['ASIGNADO_A_TERRENO', 'EN_EJECUCION'].includes(etapaDe(obra))
