import { useState } from 'react'
import { Modal, Button, Input, NumberField, Textarea } from '@/components/ui'
import { BuscadorRelacion } from '@/components/BuscadorRelacion'
import { MoneyCell } from '@/components/domain'
import { comprasService } from '@/services'
import { desglosarTotal } from '@/domain/money'
import { runAction } from '@/hooks/runAction'

export function NotaCreditoModal({ open, onClose, facturas, proveedores, onSaved }) {
  const [form, setForm] = useState({ factura_id: '', numero: '', neto: null, motivo: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const factura = facturas.find((f) => f.id === form.factura_id)
  const excede = factura && form.neto > factura.neto
  const desglose = desglosarTotal(form.neto || 0)
  const valido = factura && form.numero.trim() && form.neto > 0 && !excede && form.motivo.trim()

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(comprasService.createNotaCredito(form), 'Nota de crédito registrada')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva nota de crédito"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={guardar} loading={guardando} disabled={!valido}>Registrar</Button></>}>
      <div className="space-y-4">
        <BuscadorRelacion tabla="facturas" label="Factura de origen" obligatorio placeholder="Escribe el N° de factura…" value={form.factura_id} onChange={(id) => set('factura_id')(id)} />
        <Input label="N° nota de crédito" obligatorio mono value={form.numero} onChange={(e) => set('numero')(e.target.value)} />
        <NumberField label="Monto neto" obligatorio prefix="$" min={1} value={form.neto} onChange={set('neto')}
          error={excede ? 'Excede el neto de la factura' : undefined} />
        <Textarea label="Motivo" value={form.motivo} onChange={(e) => set('motivo')(e.target.value)} />
        <div className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span className="text-ink-soft">IVA / Total</span><span><MoneyCell value={desglose.iva} /> / <MoneyCell value={desglose.total} className="font-semibold" /></span></div>
      </div>
    </Modal>
  )
}
