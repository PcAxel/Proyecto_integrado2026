import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Modal, Button, Textarea, Mono } from '@/components/ui'
import { CardexTypeBadge } from '@/components/domain'
import { cardexService } from '@/services'
import { runAction } from '@/hooks/runAction'
import { formatFechaHora } from '@/domain/format'

export function ReversaModal({ open, onClose, movimiento: m, nombreArticulo, onSaved }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const valido = motivo.trim().length >= 5

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(cardexService.reversar(m.id, motivo), 'Reversa registrada')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reversar movimiento"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" icon={Undo2} onClick={guardar} loading={guardando} disabled={!valido}>Generar reversa</Button>
      </>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <Mono className="font-medium">{m.id}</Mono>
            <CardexTypeBadge tipo={m.tipo} />
          </div>
          <p className="mt-2">{nombreArticulo}</p>
          <p className="mt-0.5 text-xs text-ink-soft"><Mono>{m.cantidad}</Mono> unidad(es) · <Mono>{formatFechaHora(m.fecha)}</Mono>{m.obra_id && <> · <Mono>{m.obra_id}</Mono></>}</p>
        </div>
        <p className="rounded-lg bg-warn-bg p-3 text-xs text-warn">
          El movimiento original no se modifica ni se elimina: se agrega un contra-asiento auditado. Una reversa solo puede aplicarse una vez.
        </p>
        <Textarea label="Motivo de la reversa" placeholder="Ej.: artículo despachado por error" value={motivo} onChange={(e) => setMotivo(e.target.value)} hint="Mínimo 5 caracteres" />
      </div>
    </Modal>
  )
}
