import { X } from 'lucide-react'
import { Overlay } from './Overlay'
import { IconButton } from './IconButton'
import { cn } from './cn'

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative flex max-h-[90vh] w-full flex-col rounded-xl border border-line bg-surface shadow-xl', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="Cerrar" size="sm" onClick={onClose} />
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </Overlay>
  )
}
