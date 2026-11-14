/**
 * Aviso de propiedad intelectual en la consola del navegador: se ve al abrir las DevTools. Son tres `console.log` al iniciar la app
 * (costo despreciable) y no tocan nada más. Los estilos usan la paleta corporativa: azul oscuro y gris.
 */
export const AZUL = '#0B2A3F'
export const GRIS = '#6B7280'

export const TITULO = 'APEX SYSTEMS ERP.'
export const AUTORIA = 'Sistema Propietario desarrollado por Axel Plata.'
export const PROHIBICION = 'Queda estrictamente prohibida la copia, distribución o uso no autorizado del código fuente.'
/** El mensaje completo, tal como lo ve quien lea la consola. */
export const MENSAJE_COMPLETO = `${TITULO} ${AUTORIA} ${PROHIBICION}`

export const ESTILOS = {
  titulo: `font: 800 44px/1.15 system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${AZUL}; text-shadow: 2px 2px 0 #D1D5DB; letter-spacing: 1px;`,
  autoria: `font: 700 17px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #FFFFFF; background: ${AZUL}; padding: 4px 12px; border-radius: 4px;`,
  prohibicion: `font: 500 14px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${GRIS}; border-left: 4px solid ${AZUL}; padding-left: 10px;`,
}

/** @param {{log?: Function}} [consola] */
export function mostrarAvisoApex(consola = globalThis.console) {
  if (typeof consola?.log !== 'function') return
  consola.log(`%c${TITULO}`, ESTILOS.titulo)
  consola.log(`%c${AUTORIA}`, ESTILOS.autoria)
  consola.log(`%c${PROHIBICION}`, ESTILOS.prohibicion)
}
