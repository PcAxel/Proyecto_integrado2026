import { api } from './api'

/** Tablas que se pueden buscar para elegir (el servidor decide además, por rol, cuáles puede usar cada persona). Filtros admitidos: artículos `proveedor`, obras `estado`, órdenes de compra `proveedor` y `estado`. */
export const TABLAS_BUSCABLES = ['proveedores', 'clientes', 'articulos', 'obras', 'facturas', 'presupuestos', 'ordenes_compra']

/**
 * Búsqueda asíncrona para los campos que relacionan datos. El navegador nunca baja la lista completa: pide pocas coincidencias por vez
 * (máx. 20) a `/api/erp/buscar/<tabla>/?search=`; el servidor aplica los mismos permisos de lectura de siempre.
 */
export const autocompletarService = {
  /** @returns {Promise<Array<{id:string, label:string, detalle:string}>>} */
  buscar: (tabla, texto = '', limite = 15, filtros = {}) => api.get(`/erp/buscar/${encodeURIComponent(tabla)}/?search=${encodeURIComponent(texto.trim())}&limit=${limite}${
    Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('')}`),
  /** Lo ya elegido (para mostrar su nombre al editar), aunque esté inactivo. */
  porIds: (tabla, ids) => (ids.length ? api.get(`/erp/buscar/${encodeURIComponent(tabla)}/?ids=${ids.map(encodeURIComponent).join(',')}`) : Promise.resolve([])),
}
