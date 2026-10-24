import { useState } from 'react'
import { Modal, Button, Select, NumberField, Input } from '@/components/ui'
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
        <Select label="Artículo" placeholder="Seleccione…" value={form.articulo_id} onChange={(e) => set('articulo_id')(e.target.value)}
          options={articulos.filter((a) => a.activo && a.stock > 0).map((a) => ({ value: a.id, label: `${a.sku} · ${a.nombre} (${a.stock} ${a.unidad})` }))} />
        <Select label="Obra de destino" placeholder="Seleccione…" value={form.obra_id} onChange={(e) => set('obra_id')(e.target.value)}
          options={obras.filter((o) => o.estado === 'EN_CURSO').map((o) => ({ value: o.id, label: `${o.id} · ${o.nombre}` }))} />
        <NumberField label="Cantidad" min={1} suffix={art?.unidad} value={form.cantidad} onChange={set('cantidad')}
          error={excede ? `Stock insuficiente: disponible ${art.stock} ${art.unidad}` : undefined}
          hint={art && !excede ? `Disponible: ${art.stock} ${art.unidad}` : undefined} />
        <Input label="Referencia (opcional)" value={form.referencia} onChange={(e) => set('referencia')(e.target.value)} />
        {art && (
          <p className="text-xs text-ink-soft">
            Valorización al último costo: <MoneyCell value={art.costo_unitario} /> por {art.unidad}
          </p>
        )}
      </div>
    </Modal>
  )
}
