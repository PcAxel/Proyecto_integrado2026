import { api } from './api'

/** Cifras tributarias y de resultado que calcula el servidor (Administrador, Finanzas y Auditoría). */
export const finanzasService = {
  /** Gastos, ganancia neta y proyección de IVA de un mes (`YYYY-MM`; el mes en curso si se omite). */
  resumenTributario: (mes) => api.get(`/erp/finanzas/resumen/${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`),
}
