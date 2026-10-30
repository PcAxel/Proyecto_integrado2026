import { useEffect } from 'react'
import { createPortal } from 'react-dom'

const POSICION = {
  center: 'items-center justify-center p-4',
  top: 'items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]',
  right: 'justify-end',
}

/** Base compartida de Modal, Drawer y la búsqueda global: portal, velo, Escape y bloqueo de scroll. */
export function Overlay({ open, onClose, children, align = 'center' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${POSICION[align] ?? POSICION.center}`}>
      <div className="absolute inset-0 animate-fade bg-deep/55 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      {children}
    </div>,
    document.body,
  )
}
