import { useId } from 'react'
import { useLectorStore } from '@/stores/lectorStore'

/**
 * Lector de textos con la Web Speech API del navegador (voz del dispositivo, en español: es-CL primero y luego otras variantes).
 * El estado es COMPARTIDO (`lectorStore`): solo se lee un texto a la vez en toda la página, pero cada botón solo se ve «hablando» si el texto es suyo.
 * @param {{fuente?: string}} [opciones] identifica a quien lee; por defecto, un id propio del componente
 * @returns {{soportado: boolean, estado: 'inactivo'|'hablando'|'pausado', hablando: boolean, pausado: boolean, iniciar: (texto: string) => void, pausar: () => void, reanudar: () => void, detener: () => void}}
 */
export function useSpeech({ fuente } = {}) {
  const propio = useId()
  const id = fuente ?? propio
  const soportado = useLectorStore((s) => s.soportado)
  const estado = useLectorStore((s) => s.estado)
  const activa = useLectorStore((s) => s.fuente)
  const { iniciar, pausar, reanudar, detener } = useLectorStore.getState()
  const mio = activa === id
  const miEstado = mio ? estado : 'inactivo'
  return { soportado, estado: miEstado, hablando: miEstado === 'hablando', pausado: miEstado === 'pausado', iniciar: (texto) => iniciar(texto, id), pausar, reanudar, detener }
}
