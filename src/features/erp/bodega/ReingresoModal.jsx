import { useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { Modal, Button, NumberField, Textarea, Mono } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { cardexService } from '@/services'
import { runAction } from '@/hooks/runAction'

/** Logística inversa (Regla 3): devuelve sobrante al stock al costo de la salida original. */
export function ReingresoModal({ open, onClose, movimiento: m, nombreArticulo, onSaved }) {
  const max = m.reingresable
  const [cantidad, setCantidad] = useState(max)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const valido = cantidad > 0 && cantidad <= max

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(cardexService.reingresarSobrante({ salida_id: m.id, cantidad, motivo }), 'Sobrante reingresado')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reingreso de sobrante"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={PackagePlus} onClick={guardar} loading={guardando} disabled={!valido}>Reingresar</Button>
      </>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
          <p><Mono className="font-medium">{m.id}</Mono> · {nombreArticulo}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Salida a <Mono>{m.obra_id}</Mono> de <Mono>{m.cantidad}</Mono> · aún reingresable: <Mono>{max}</Mono>
          </p>
        </div>
        <NumberField label="Cantidad sobrante" min={1} max={max} value={cantidad} onChange={setCantidad}
          error={cantidad > max ? `Máximo reingresable: ${max}` : undefined} />
        <p className="text-xs text-ink-soft">
          Se tasa al costo original (<MoneyCell value={m.costo_unitario} />) y descuenta el costo de la obra. La salida original se conserva.
        </p>
        <Textarea label="Observación (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Modal>
  )
}
