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
        className={cn('relative flex max-h-[90vh] w-full animate-pop flex-col rounded-2xl bg-surface shadow-pop', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="t-display text-xl">{title}</h2>
          <IconButton icon={X} label="Cerrar" size="sm" onClick={onClose} />
        </header>
        <div className="overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-slate-50 px-6 py-4">{footer}</footer>}
      </div>
    </Overlay>
  )
}
