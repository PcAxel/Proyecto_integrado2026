import { useMemo, useState } from 'react'
import { PackageCheck, Plus, X, AlertTriangle } from 'lucide-react'
import { Modal, Button, NumberField, Input, IconButton } from '@/components/ui'
import { BuscadorRelacion } from '@/components/BuscadorRelacion'
import { articulosService, cardexService } from '@/services'
import { superaMaximo } from '@/domain/cardex'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'

const LINEA = () => ({ clave: Math.random().toString(36).slice(2), articulo_id: '', cantidad: null })

/**
 * Ingresar recepción: mercadería que llega a bodega con su guía de despacho. Cada línea deja una ENTRADA_RECEPCION en el Cardex
 * (todo o nada), valorada al costo vigente; el costo real se actualiza cuando se registra la factura de compra.
 */
export function RecepcionModal({ open, onClose, onSaved }) {
  const { data: articulos } = useResource(() => articulosService.list(), [])
  const [referencia, setReferencia] = useState('')
  const [lineas, setLineas] = useState([LINEA()])
  const [guardando, setGuardando] = useState(false)
  const activos = useMemo(() => (articulos ?? []).filter((a) => a.activo), [articulos])
  const cambiar = (clave, campo) => (v) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: v } : l)))
  const repetidos = new Set(lineas.map((l) => l.articulo_id).filter((id, i, arr) => id && arr.indexOf(id) !== i))
  const valido = referencia.trim().length >= 3 && lineas.length > 0 && repetidos.size === 0
    && lineas.every((l) => l.articulo_id && l.cantidad > 0 && activos.find((a) => a.id === l.articulo_id)?.costo_unitario > 0)

  const guardar = async () => {
    setGuardando(true)
    const r = await runAction(
      cardexService.recepcionar({ referencia: referencia.trim(), items: lineas.map(({ articulo_id, cantidad }) => ({ articulo_id, cantidad })) }),
      'Recepción ingresada: el stock ya está en bodega',
    )
    setGuardando(false)
    if (r) { onSaved?.(); onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ingresar recepción" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={PackageCheck} onClick={guardar} loading={guardando} disabled={!valido}>Registrar ingreso</Button>
      </>}>
      <div className="space-y-4">
        <Input label="Documento de respaldo" obligatorio placeholder="N° de guía de despacho u orden de compra" value={referencia} onChange={(e) => setReferencia(e.target.value)}
          hint="Obligatorio: queda como referencia de cada entrada en el Cardex." />
        <div className="space-y-3">
          {lineas.map((l, i) => {
            const a = activos.find((x) => x.id === l.articulo_id)
            const sobre = a && l.cantidad > 0 && superaMaximo(a.stock + l.cantidad, a.stock_maximo)
            return (
              <div key={l.clave} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                  <BuscadorRelacion tabla="articulos" label={i === 0 ? 'Artículo' : undefined} obligatorio={i === 0} aria-label={`Artículo ${i + 1}`} placeholder="Escribe el SKU o el nombre…" value={l.articulo_id} onChange={(id) => cambiar(l.clave, 'articulo_id')(id)}
                    error={repetidos.has(l.articulo_id) ? 'Artículo repetido: súmalo en una sola línea' : undefined} />
                  <NumberField label={i === 0 ? 'Cantidad' : undefined} obligatorio={i === 0} aria-label={`Cantidad ${i + 1}`} min={1} suffix={a?.unidad} value={l.cantidad} onChange={cambiar(l.clave, 'cantidad')} />
                  <IconButton icon={X} label="Quitar línea" size="sm" disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} />
                </div>
                {a && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Stock actual: <b>{a.stock} {a.unidad}</b>{a.stock_maximo > 0 ? ` · máximo ${a.stock_maximo}` : ''}
                    {a.costo_unitario === 0 ? ' · sin costo registrado: ingresa primero su factura de compra' : ''}
                  </p>
                )}
                {sobre && (
                  <p role="status" className="mt-1 flex items-center gap-1 text-xs font-medium text-warn">
                    <AlertTriangle className="h-3.5 w-3.5" />Con este ingreso quedarían {a.stock + l.cantidad} {a.unidad}, sobre el máximo de {a.stock_maximo}.
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, LINEA()])}>Agregar otro artículo</Button>
      </div>
    </Modal>
  )
}
