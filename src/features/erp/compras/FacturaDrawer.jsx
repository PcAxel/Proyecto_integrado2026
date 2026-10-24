import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Drawer, Button, IconButton, Input, Select, NumberField, Mono, cn } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { comprasService, articulosService, proveedoresService } from '@/services'
import { fechaLocal } from '@/domain/format'
import { calcularFactura, calcularNeto, formatCLP } from '@/domain/money'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

const ITEM_VACIO = { articulo_id: '', cantidad: 1, precio_lista: null }
const hoy = () => fechaLocal()

/** Registro de factura con hasta 3 descuentos en cascada y cálculo en vivo. */
export function FacturaDrawer({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ proveedor_id: '', numero: '', fecha: hoy() })
  const [descuentos, setDescuentos] = useState([null, null, null])
  const [items, setItems] = useState([{ ...ITEM_VACIO }])
  const [guardando, setGuardando] = useState(false)
  const { data: proveedores } = useResource(() => proveedoresService.list(), [])
  const { data: articulos } = useResource(() => articulosService.list(), [])

  const opciones = (articulos ?? []).filter((a) => !form.proveedor_id || a.proveedor_id === form.proveedor_id)
  const dscs = descuentos.map((d) => d ?? 0)
  const completos = items.filter((it) => it.articulo_id && it.cantidad > 0 && it.precio_lista > 0)
  const calc = calcularFactura(completos, dscs)
  const valido = form.proveedor_id && form.numero.trim() && completos.length > 0 && completos.length === items.length
  const setItem = (i, campo, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: v } : x)))

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(
      comprasService.createFactura({ ...form, numero: form.numero.trim(), descuentos: dscs.filter((d) => d > 0), items: completos }),
      'Factura registrada y entradas generadas en el Cardex',
    )
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Registrar factura de compra" width="max-w-3xl">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Proveedor" placeholder="Seleccione…" value={form.proveedor_id}
            onChange={(e) => { setForm({ ...form, proveedor_id: e.target.value }); setItems([{ ...ITEM_VACIO }]) }}
            options={(proveedores ?? []).map((p) => ({ value: p.id, label: p.razon_social }))} className="sm:col-span-2" />
          <Input label="N° factura" mono value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          <Input label="Fecha" type="date" mono value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Descuentos en cascada <span className="font-normal text-ink-soft">(cada uno se aplica sobre el resultado del anterior)</span></p>
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
            {descuentos.map((d, i) => (
              <NumberField key={i} label={`Descuento ${i + 1}`} suffix="%" min={0} max={100} step={0.5} value={d}
                onChange={(v) => setDescuentos((xs) => xs.map((x, j) => (j === i ? v : x)))} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Ítems</p>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setItems((xs) => [...xs, { ...ITEM_VACIO }])}>Agregar ítem</Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className={cn('grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_7rem_2rem]', i > 0 && 'sm:[&_label>span.mb-1]:sr-only')}>
                <Select className="col-span-2 sm:col-span-1" label="Artículo" placeholder="Seleccione…" value={it.articulo_id}
                  onChange={(e) => setItem(i, 'articulo_id', e.target.value)}
                  options={opciones.map((a) => ({ value: a.id, label: `${a.sku} · ${a.nombre}` }))} />
                <NumberField label="Cantidad" min={1} value={it.cantidad} onChange={(v) => setItem(i, 'cantidad', v)} />
                <NumberField label="Precio lista" prefix="$" min={0} value={it.precio_lista} onChange={(v) => setItem(i, 'precio_lista', v)} />
                <div className="pb-2 text-left sm:text-right">
                  <p className={cn('mb-1 text-xs font-medium text-ink-soft', i > 0 && 'sm:hidden')}>Costo neto</p>
                  <Mono className="text-sm">{it.precio_lista > 0 ? formatCLP(calcularNeto(it.precio_lista, dscs)) : '—'}</Mono>
                </div>
                <IconButton icon={X} label="Quitar ítem del formulario" size="sm" className="justify-self-end" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-slate-50 p-4 text-sm">
          <Fila label="Subtotal bruto" value={calc.bruto} />
          {calc.pasos.map((p, i) => <Fila key={i} label={`Descuento ${i + 1} (${p.pct}%)`} value={-p.monto} tono="text-ok" />)}
          <Fila label="Neto" value={calc.neto} fuerte />
          <Fila label="IVA 19 %" value={calc.iva} />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Total</span><MoneyCell value={calc.total} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando} disabled={!valido}>Registrar factura</Button>
        </div>
      </div>
    </Drawer>
  )
}

function Fila({ label, value, tono = '', fuerte = false }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${fuerte ? 'font-medium' : 'text-ink-soft'}`}>
      <span>{label}</span><MoneyCell value={value} className={tono} />
    </div>
  )
}
