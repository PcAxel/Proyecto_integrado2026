import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const POSICION = {
  center: 'items-center justify-center p-4',
  top: 'items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]',
  right: 'justify-end',
}

/** Capas abiertas, la última es la de encima: Escape solo cierra esa (un modal sobre un modal no cierra los de abajo). */
const pila = []
let scrollOriginal = '' // el `overflow` del body antes de abrir la primera capa

/** Base compartida de Modal, Drawer y la búsqueda global: portal, velo, Escape y bloqueo de scroll. */
export function Overlay({ open, onClose, children, align = 'center' }) {
  const alCerrar = useRef(onClose)
  alCerrar.current = onClose // siempre la versión más reciente, sin volver a registrar la capa (que la subiría al tope)
  const marca = useRef({})

  useEffect(() => {
    if (!open) return undefined
    const yo = marca.current
    if (!pila.length) scrollOriginal = document.body.style.overflow
    pila.push(yo)
    const onKey = (e) => e.key === 'Escape' && pila[pila.length - 1] === yo && alCerrar.current()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      pila.splice(pila.indexOf(yo), 1)
      document.body.style.overflow = pila.length ? 'hidden' : scrollOriginal
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${POSICION[align] ?? POSICION.center}`}>
      <div className="absolute inset-0 animate-fade bg-deep/55 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      {children}
    </div>,
    document.body,
  )
}
