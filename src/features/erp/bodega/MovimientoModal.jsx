import { useState } from 'react'
import { Modal, Button, NumberField, Input } from '@/components/ui'
import { BuscadorRelacion } from '@/components/BuscadorRelacion'
import { MoneyCell } from '@/components/domain'
import { cardexService } from '@/services'
import { runAction } from '@/hooks/runAction'

/** Salida de material a una obra en curso. Las entradas solo nacen de facturas de compra. */
export function MovimientoModal({ open, onClose, articulos, obras, articuloInicial, onSaved }) {
  const [form, setForm] = useState({ articulo_id: articuloInicial ?? '', obra_id: '', cantidad: null, referencia: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const art = articulos.find((a) => a.id === form.articulo_id)
  const excede = art && form.cantidad > art.stock
  const valido = art && form.obra_id && form.cantidad > 0 && !excede

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(cardexService.create({ tipo: 'SALIDA_OBRA', ...form }), 'Salida registrada en el Cardex')
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva salida a obra"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} loading={guardando} disabled={!valido}>Registrar salida</Button>
      </>}>
      <div className="space-y-4">
        <BuscadorRelacion tabla="articulos" label="Artículo" obligatorio placeholder="Escribe el SKU o el nombre…" value={form.articulo_id} onChange={(id) => set('articulo_id')(id)} />
        <BuscadorRelacion tabla="obras" filtros={{ estado: 'EN_CURSO' }} label="Obra de destino" obligatorio placeholder="Escribe el código o el nombre de la obra…" value={form.obra_id} onChange={(id) => set('obra_id')(id)} />
        <NumberField label="Cantidad" obligatorio min={1} suffix={art?.unidad} value={form.cantidad} onChange={set('cantidad')}
          error={excede ? `Stock insuficiente: disponible ${art.stock} ${art.unidad}` : undefined}
          hint={art && !excede ? `Disponible: ${art.stock} ${art.unidad}` : undefined} />
        <Input label="Referencia" opcional value={form.referencia} onChange={(e) => set('referencia')(e.target.value)} />
        {art && (
          <p className="text-xs text-ink-soft">
            Valorización al último costo: <MoneyCell value={art.costo_unitario} /> por {art.unidad}
          </p>
        )}
      </div>
    </Modal>
  )
}
