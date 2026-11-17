import { CheckCircle2, Undo2, AlertTriangle } from 'lucide-react'
import { Modal, Button, Mono } from '@/components/ui'

/**
 * Pausa después de escanear un producto para retirarlo: nada se suma al retiro hasta que la persona confirma lo que ve
 * (descripción y stock real en ese instante). «Cancelar / Equivocación» descarta la lectura sin dejar rastro.
 * @param {{lectura: {articulo:{nombre:string, sku:string, unidad:string}, lote?:{codigo:string}|null, cantidad:number, stock:number, enRetiro:number, pedido:number}|null,
 *   onConfirmar:()=>void, onCancelar:()=>void}} props
 */
export function ConfirmarLecturaModal({ lectura, onConfirmar, onCancelar }) {
  if (!lectura) return null
  const { articulo: a, lote, cantidad, stock, enRetiro, pedido } = lectura
  const disponible = stock - enRetiro // lo que queda sin contar lo que ya se separó en este mismo retiro
  const insuficiente = cantidad > disponible
  return (
    <Modal open onClose={onCancelar} title="Confirma el producto escaneado"
      footer={(
        <div className="grid w-full grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" icon={Undo2} onClick={onCancelar} className="border-crit/50 text-crit hover:border-crit hover:bg-crit-bg">Cancelar / Equivocación</Button>
          <Button size="lg" variant="success" icon={CheckCircle2} onClick={onConfirmar} disabled={insuficiente}>Confirmar Retiro</Button>
        </div>
      )}>
      <div className="space-y-4">
        <div>
          <p className="text-xl font-semibold leading-snug">{a.nombre}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft"><Mono>{a.sku}</Mono>{lote && <span>Lote <Mono className="font-medium text-brand-dark">{lote.codigo}</Mono></span>}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl border border-line bg-slate-50 p-3">
            <p className="text-xs text-ink-soft">Stock disponible ahora</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${insuficiente ? 'text-crit' : ''}`}>{stock}<span className="ml-1 text-sm font-medium text-ink-soft">{a.unidad}</span></p>
          </div>
          <div className="rounded-xl border border-brand/30 bg-brand-tint/50 p-3">
            <p className="text-xs text-ink-soft">Se retira</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-brand-dark">{cantidad}<span className="ml-1 text-sm font-medium text-ink-soft">{a.unidad}</span></p>
          </div>
        </div>
        <p className="text-xs text-ink-soft">En esta solicitud: llevas <b>{enRetiro}</b> de <b>{pedido}</b> {a.unidad}. El stock del Cardex no cambia hasta que confirmes el retiro completo.</p>
        {insuficiente && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg p-3 text-sm font-medium text-crit"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Stock insuficiente: quedan {disponible} {a.unidad} sin separar. Cancela y revisa el producto.</p>
        )}
      </div>
    </Modal>
  )
}
