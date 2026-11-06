import { ArrowDown, ArrowUp, Share, SquarePlus } from 'lucide-react'
import { Modal, Button } from '@/components/ui'

/** Pastilla que imita el botón real de Safari, para que el técnico lo reconozca al instante. */
function Boton({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-slate-50 px-3 py-2 text-sm font-semibold text-ink">
      <Icon className="h-5 w-5 text-[#007AFF]" aria-hidden="true" />{children}
    </span>
  )
}

function Paso({ n, titulo, children }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white" aria-hidden="true">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{titulo}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  )
}

/**
 * Guía paso a paso para «Agregar a inicio» en Safari. Apple no permite lanzar la instalación
 * desde la web, así que se guía al usuario. En iPhone el botón Compartir está abajo; en iPad, arriba.
 */
export function GuiaIOS({ open, onClose, ipad }) {
  const Flecha = ipad ? ArrowUp : ArrowDown
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instala FYAG en tu iPhone"
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      <ol className="space-y-6">
        <Paso n={1} titulo={ipad ? 'Toca el ícono Compartir, arriba en Safari' : 'Toca el ícono Compartir, abajo en Safari'}>
          <Boton icon={Share}>Compartir</Boton>
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            <Flecha className="h-5 w-5 animate-bounce text-brand motion-reduce:animate-none" aria-hidden="true" />
            {ipad ? 'Está en la barra superior, junto a la dirección.' : 'Está en la barra inferior, al centro.'}
          </p>
        </Paso>
        <Paso n={2} titulo="Desliza el menú y elige «Agregar a inicio»">
          <Boton icon={SquarePlus}>Agregar a inicio</Boton>
          <p className="mt-2 text-sm text-ink-soft">Si no lo ves, desliza hacia arriba la lista de opciones.</p>
        </Paso>
        <Paso n={3} titulo="Toca «Agregar», arriba a la derecha">
          <p className="text-sm text-ink-soft">El ícono de FYAG aparecerá en tu pantalla de inicio. Ábrelo desde ahí: se ve y funciona como una app, sin barra del navegador.</p>
        </Paso>
      </ol>
    </Modal>
  )
}
