import { useCallback, useEffect, useRef, useState } from 'react'
import { dividirTexto, elegirVoz } from '@/domain/lectura'

const soportado = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/**
 * Lector de textos con la Web Speech API del navegador (sin servicios externos: la voz es la del dispositivo).
 * Intenta usar una voz en español (es-CL primero, luego otras latinoamericanas y es-ES). Los textos largos se leen por trozos, porque
 * Chrome corta la lectura pasados ~15 s. Solo se lee un texto a la vez en toda la página: iniciar uno detiene el anterior.
 * @param {{lang?: string, rate?: number}} [opciones]
 * @returns {{soportado: boolean, estado: 'inactivo'|'hablando'|'pausado', hablando: boolean, pausado: boolean, iniciar: (texto: string) => void, pausar: () => void, reanudar: () => void, detener: () => void}}
 */
export function useSpeech({ lang = 'es-CL', rate = 1 } = {}) {
  const ok = soportado()
  const [estado, setEstado] = useState('inactivo')
  const voz = useRef(null)
  const ticket = useRef(0) // identifica la lectura vigente: los avisos de una lectura cancelada se ignoran

  // Las voces del sistema se cargan de forma asíncrona (sobre todo en Chrome): se vuelve a elegir cuando cambian.
  useEffect(() => {
    if (!ok) return undefined
    const elegir = () => { voz.current = elegirVoz(window.speechSynthesis.getVoices(), lang) }
    elegir()
    window.speechSynthesis.addEventListener?.('voiceschanged', elegir)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', elegir)
  }, [ok, lang])

  const detener = useCallback(() => {
    if (!ok) return
    ticket.current += 1
    window.speechSynthesis.cancel()
    setEstado('inactivo')
  }, [ok])

  const iniciar = useCallback((texto) => {
    if (!ok) return
    const trozos = dividirTexto(texto)
    if (!trozos.length) return
    window.speechSynthesis.cancel() // corta cualquier lectura anterior (de este botón o de otro)
    const mio = ++ticket.current
    trozos.forEach((trozo, i) => {
      const u = new window.SpeechSynthesisUtterance(trozo)
      u.lang = voz.current?.lang ?? lang
      if (voz.current) u.voice = voz.current
      u.rate = rate
      if (i === 0) u.onstart = () => { if (ticket.current === mio) setEstado('hablando') }
      if (i === trozos.length - 1) u.onend = () => { if (ticket.current === mio) setEstado('inactivo') }
      u.onerror = () => { if (ticket.current === mio) setEstado('inactivo') } // «canceled» al cambiar de lectura, o un fallo del motor de voz
      window.speechSynthesis.speak(u)
    })
    setEstado('hablando')
  }, [ok, lang, rate])

  const pausar = useCallback(() => {
    if (!ok) return
    window.speechSynthesis.pause()
    setEstado('pausado')
  }, [ok])

  const reanudar = useCallback(() => {
    if (!ok) return
    window.speechSynthesis.resume()
    setEstado('hablando')
  }, [ok])

  // Al salir de la pantalla no debe quedar una voz leyendo.
  useEffect(() => () => { if (ok && ticket.current) window.speechSynthesis.cancel() }, [ok])

  return { soportado: ok, estado, hablando: estado === 'hablando', pausado: estado === 'pausado', iniciar, pausar, reanudar, detener }
}
