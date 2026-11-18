import { api } from './api'

/** Cifras tributarias y de resultado que calcula el servidor (Administrador, Finanzas y Auditoría). */
export const finanzasService = {
  /** Gastos, ganancia neta y proyección de IVA de un mes (`YYYY-MM`; el mes en curso si se omite). */
  resumenTributario: (mes) => api.get(`/erp/finanzas/resumen/${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`),
  /** Libro de IVA del mes: documentos de venta y de compra, notas de crédito, remanente que se arrastra e historial. */
  impuestos: (mes) => api.get(`/erp/finanzas/impuestos/${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`),
}
