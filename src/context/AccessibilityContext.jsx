import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { normalizarPrefsAccesibilidad } from '@/domain/estados'

/**
 * Contexto de accesibilidad de toda la app. Hoy guarda el Modo Daltonismo (`colorBlindMode`): cuando está activo, los estados llevan además un
 * ícono y un borde de forma propia, para no depender de distinguir el rojo del verde. La preferencia se recuerda en este navegador.
 * Sin proveedor (p. ej. en una prueba) los componentes funcionan con el modo apagado.
 */
const CLAVE = 'fyag.accesibilidad'

const AccessibilityContext = createContext({ colorBlindMode: false, toggleColorBlindMode: () => {}, setColorBlindMode: () => {} })

const leer = () => {
  try { return normalizarPrefsAccesibilidad(JSON.parse(localStorage.getItem(CLAVE))).colorBlindMode } catch { return false }
}

export function AccessibilityProvider({ children }) {
  const [colorBlindMode, setColorBlindMode] = useState(leer)

  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify({ colorBlindMode })) } catch { /* sin almacenamiento: el cambio dura la sesión */ }
    document.documentElement.toggleAttribute('data-daltonismo', colorBlindMode) // por si algún estilo global lo necesita
  }, [colorBlindMode])

  const toggleColorBlindMode = useCallback(() => setColorBlindMode((v) => !v), [])
  const valor = useMemo(() => ({ colorBlindMode, toggleColorBlindMode, setColorBlindMode }), [colorBlindMode, toggleColorBlindMode])
  return <AccessibilityContext.Provider value={valor}>{children}</AccessibilityContext.Provider>
}

/** @returns {{colorBlindMode: boolean, toggleColorBlindMode: () => void, setColorBlindMode: (v: boolean) => void}} */
export const useAccessibility = () => useContext(AccessibilityContext)
