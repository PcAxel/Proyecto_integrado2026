import { useCallback, useEffect, useRef, useState } from 'react'
import { componerDictado, constructorDictado, mensajeErrorDictado } from '@/domain/dictado'

/**
 * Dictado por voz con el reconocimiento del navegador (Web Speech API): sin servidor, sin claves y sin costo.
 * Mientras hablas, `onTexto` recibe el texto completo (lo que ya había + lo dictado, incluso lo provisional) para mostrarlo en el cuadro.
 * Nota de privacidad: en Chrome y Edge el audio lo procesa el servicio de voz del navegador, por eso necesita internet.
 * `detener({ enviar: true })` termina el dictado y, cuando el navegador ya entregó la última frase, avisa con `onTerminar` (para enviar el mensaje sin otro clic).
 * Si el navegador corta solo (silencio) o se detiene sin `enviar`, el texto queda en el cuadro y NO se envía.
 * @param {{lang?: string, onTexto: (texto: string) => void, onTerminar?: () => void}} opciones
 */
export function useDictado({ lang = 'es-CL', onTexto, onTerminar }) {
  const Reconocimiento = constructorDictado()
  const rec = useRef(null)
  const alTexto = useRef(onTexto)
  alTexto.current = onTexto
  const alTerminar = useRef(onTerminar)
  alTerminar.current = onTerminar
  const enviarAlTerminar = useRef(false)
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState(null)

  const detener = useCallback(({ enviar = false } = {}) => { enviarAlTerminar.current = Boolean(enviar && rec.current); rec.current?.stop() }, [])

  const iniciar = useCallback((base = '') => {
    if (!Reconocimiento || rec.current) return
    setError(null)
    const r = new Reconocimiento()
    r.lang = lang
    r.continuous = true       // sigue escuchando hasta que lo detengas (o el navegador corte por silencio)
    r.interimResults = true   // muestra el texto mientras hablas
    r.onresult = (e) => {
      // Se recalcula desde cero en cada evento: lo definitivo y lo provisional de toda la sesión.
      const partes = Array.from(e.results)
      const finales = partes.filter((p) => p.isFinal).map((p) => p[0].transcript).join(' ')
      const parcial = partes.filter((p) => !p.isFinal).map((p) => p[0].transcript).join(' ')
      alTexto.current(componerDictado(base, finales, parcial))
    }
    r.onerror = (e) => { const m = mensajeErrorDictado(e.error); if (m) setError(m) }
    r.onend = () => {
      rec.current = null
      setEscuchando(false)
      const enviar = enviarAlTerminar.current // se lee aquí, cuando ya llegaron los últimos resultados
      enviarAlTerminar.current = false
      if (enviar) alTerminar.current?.()
    }
    rec.current = r
    try { r.start(); setEscuchando(true) } catch { rec.current = null; setError(mensajeErrorDictado('otro')) }
  }, [Reconocimiento, lang])

  useEffect(() => () => { rec.current?.abort() }, []) // al salir de la pantalla no debe quedar el micrófono abierto

  return { soportado: Boolean(Reconocimiento), escuchando, error, iniciar, detener, limpiarError: () => setError(null) }
}
