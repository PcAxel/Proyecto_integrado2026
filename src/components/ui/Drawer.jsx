import { X } from 'lucide-react'
import { Overlay } from './Overlay'
import { IconButton } from './IconButton'

export function Drawer({ open, onClose, title, children, width = 'max-w-lg' }) {
  return (
    <Overlay open={open} onClose={onClose} align="right">
      <aside role="dialog" aria-modal="true" aria-label={title} className={`relative flex h-full w-full ${width} flex-col border-l border-line bg-surface shadow-xl`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="Cerrar" size="sm" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </Overlay>
  )
}
