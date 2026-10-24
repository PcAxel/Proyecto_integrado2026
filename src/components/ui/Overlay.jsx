import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Base compartida de Modal y Drawer: portal, scrim, Escape y bloqueo de scroll. */
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
    <div className={`fixed inset-0 z-50 flex ${align === 'right' ? 'justify-end' : 'items-center justify-center p-4'}`}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      {children}
    </div>,
    document.body,
  )
}
