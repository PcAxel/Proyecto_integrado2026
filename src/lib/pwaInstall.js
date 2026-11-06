import { useSyncExternalStore } from 'react'

/**
 * Captura `beforeinstallprompt` desde que arranca la app. El navegador lo dispara una sola vez,
 * normalmente antes de que el empleado llegue a la pantalla de descarga (login → términos → descarga
 * ocurre sin recargar), así que escucharlo dentro de esa pantalla lo perdería.
 */
let evento = null
let instalada = false
let iniciado = false
let version = 0
const suscriptores = new Set()
const avisar = () => { version++; suscriptores.forEach((f) => f()) }

export function iniciarCapturaInstalacion() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // evita el mini-aviso del navegador; el botón de la app lo dispara cuando corresponde
    evento = e
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    instalada = true
    evento = null
    avisar()
  })
}

/** Abre el diálogo nativo. @returns {Promise<'accepted'|'dismissed'|null>} */
export async function lanzarInstalacion() {
  if (!evento) return null
  const e = evento
  evento = null // el evento solo sirve una vez
  avisar()
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') { instalada = true; avisar() }
  return outcome
}

const suscribir = (f) => { suscriptores.add(f); return () => suscriptores.delete(f) }

/** Estado reactivo de la instalación: { promptDisponible, instaladaEnSesion }. */
export function usePwaInstall() {
  useSyncExternalStore(suscribir, () => version)
  return { promptDisponible: evento !== null, instaladaEnSesion: instalada }
}
