import { useState } from 'react'
import { Modal, Button, Input, Select, NumberField } from '@/components/ui'
import { BuscadorRelacion } from '@/components/BuscadorRelacion'
import { articulosService } from '@/services'
import { validarReglasStock } from '@/domain/cardex'
import { runAction } from '@/hooks/runAction'

const UNIDADES = ['un', 'm', 'm²', 'lt', 'cil', 'kg'].map((u) => ({ value: u, label: u }))

/** Alta y edición de datos maestros. El stock y el costo no se editan: provienen del Cardex y de las compras. */
export function ArticuloModal({ open, onClose, articulo, categorias, onSaved }) {
  const editando = Boolean(articulo)
  const [form, setForm] = useState(() => articulo ?? { sku: '', nombre: '', categoria: '', unidad: 'un', stock_minimo: 0, stock_minimo_critico: 0, stock_maximo: 0, proveedor_id: '' })
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const errorReglas = validarReglasStock(form)
  const valido = form.sku.trim() && form.nombre.trim() && form.categoria.trim() && form.proveedor_id && !errorReglas

  const guardar = async () => {
    setGuardando(true)
    const { id, stock, estado_stock, costo_unitario, ...datos } = form
    const r = await runAction(
      editando ? articulosService.update(articulo.id, datos) : articulosService.create({ ...datos, sku: datos.sku.trim().toUpperCase() }),
      editando ? 'Artículo actualizado' : 'Artículo creado',
    )
    setGuardando(false)
    if (r) { onSaved(); onClose() }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? `Editar ${articulo.sku}` : 'Nuevo artículo'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} loading={guardando} disabled={!valido}>{editando ? 'Guardar cambios' : 'Crear artículo'}</Button>
      </>}
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="SKU" obligatorio mono value={form.sku} disabled={editando} onChange={(e) => set('sku')(e.target.value)} className="col-span-1" />
        <Select label="Unidad" obligatorio value={form.unidad} onChange={(e) => set('unidad')(e.target.value)} options={UNIDADES} />
        <Input label="Nombre" obligatorio value={form.nombre} onChange={(e) => set('nombre')(e.target.value)} className="col-span-2" />
        <div className="col-span-2">
          <Input label="Categoría" obligatorio list="categorias-art" value={form.categoria} onChange={(e) => set('categoria')(e.target.value)} />
          <datalist id="categorias-art">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        {/* Proveedor: se busca en el servidor mientras se escribe (nunca se descarga la lista completa). */}
        <BuscadorRelacion className="col-span-2" tabla="proveedores" label="Proveedor habitual" obligatorio value={form.proveedor_id}
          placeholder="Escribe la razón social o el RUT…" onChange={(id) => set('proveedor_id')(id)} />
      </div>
      <fieldset className="mt-4 rounded-xl border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Reglas de stock</legend>
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Mínimo crítico" opcional min={0} value={form.stock_minimo_critico ?? 0} onChange={(v) => set('stock_minimo_critico')(v ?? 0)} hint="Urgente" />
          <NumberField label="Stock mínimo" opcional min={0} value={form.stock_minimo} onChange={(v) => set('stock_minimo')(v ?? 0)} hint="Reponer" />
          <NumberField label="Stock máximo" opcional min={0} value={form.stock_maximo ?? 0} onChange={(v) => set('stock_maximo')(v ?? 0)} hint="0 = sin tope" />
        </div>
        {errorReglas
          ? <p role="alert" className="mt-2 text-xs font-medium text-crit">{errorReglas}</p>
          : <p className="mt-2 text-xs text-ink-faint">Crítico ≤ mínimo ≤ máximo. Bajo el mínimo se sugiere reponer; en el crítico es urgente; sobre el máximo se avisa al recepcionar.</p>}
      </fieldset>
      <p className="mt-4 text-xs text-ink-faint"><span className="font-semibold text-crit">*</span> obligatorio. El stock se deriva del Cardex y el costo se actualiza con cada factura de compra.</p>
    </Modal>
  )
}
