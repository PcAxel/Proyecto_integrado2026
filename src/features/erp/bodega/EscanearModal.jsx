import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, ArrowUpFromLine, ShoppingCart, History, Package, ClipboardCheck, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { Modal, Button, Select, NumberField, Badge } from '@/components/ui'
import { StockBadge } from '@/components/domain'
import { articulosService, cardexService, obrasService, lotesService } from '@/services'
import { resolverCodigo } from '@/domain/etiquetas'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'
import { runAction } from '@/hooks/runAction'
import { formatFecha } from '@/domain/format'
import { EscanerQr } from './EscanerQr'

/**
 * Escanear un producto: lee su QR y muestra su ficha con el stock real. Desde ahí se descuenta a una obra (misma regla
 * de siempre: obra obligatoria, sin stock negativo, auditoría) o se va a registrar la compra, que es lo que suma stock.
 */
export function EscanearModal({ open, onClose }) {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.user.rol)
  const [articulos, setArticulos] = useState([])
  const [obras, setObras] = useState([])
  const [lotes, setLotes] = useState([])
  const [seleccion, setSeleccion] = useState(null) // id del artículo escaneado
  const [loteId, setLoteId] = useState(null) // id del lote o cilindro escaneado, si el QR era de uno
  const [form, setForm] = useState({ obra_id: '', cantidad: null })
  const [guardando, setGuardando] = useState(false)
  const puedeMover = can(rol, 'cardex.crear')

  const cargar = () => Promise.all([articulosService.list({ incluirInactivos: true }), obrasService.list({ estado: 'EN_CURSO' }), lotesService.list()])
    .then(([a, o, l]) => { setArticulos(a); setObras(o); setLotes(l) })
    .catch((e) => toast.error(e.message))
  useEffect(() => { if (open) { setSeleccion(null); setLoteId(null); setForm({ obra_id: '', cantidad: null }); cargar() } }, [open])

  const art = articulos.find((a) => a.id === seleccion)
  const lote = lotes.find((l) => l.id === loteId)
  const tope = lote ? Math.min(lote.restante, art?.stock ?? 0) : art?.stock ?? 0
  const unidadUnica = lote?.tipo === 'SERIE'
  const cantidad = unidadUnica ? 1 : form.cantidad
  const excede = art && cantidad > tope
  const valido = art && form.obra_id && cantidad > 0 && !excede

  const alLeer = (texto) => {
    const r = resolverCodigo(texto, articulos, lotes)
    if (!r.ok) { toast.error(r.error); return }
    setSeleccion(r.articulo.id)
    setLoteId(r.lote?.id ?? null)
    setForm({ obra_id: '', cantidad: null })
  }

  const descontar = async () => {
    setGuardando(true)
    const r = await runAction(
      cardexService.create({ tipo: 'SALIDA_OBRA', articulo_id: art.id, cantidad, obra_id: form.obra_id, referencia: 'Salida por escaneo QR', lote_id: lote?.id ?? null }),
      `Salida registrada: ${cantidad} ${art.unidad} de ${lote?.codigo ?? art.sku}`,
    )
    setGuardando(false)
    if (r) { await cargar(); setForm({ obra_id: '', cantidad: null }) }
  }

  return (
    <Modal open={open} onClose={onClose} title={art ? 'Producto escaneado' : 'Escanear producto'}>
      {!art ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">Apunta la cámara al QR de la etiqueta. Te mostramos el producto y su stock actual.</p>
          <EscanerQr onCodigo={alLeer} />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-mono text-sm text-ink-soft">{lote?.codigo ?? art.sku}</p>
            <p className="text-lg font-semibold leading-snug">{art.nombre}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StockBadge stock={art.stock} minimo={art.stock_minimo} unidad={art.unidad} />
              <Badge tone="neutral" icon={Package}>Mínimo {art.stock_minimo} {art.unidad}</Badge>
            </div>
            {lote && (
              <div className="mt-3 rounded-lg bg-brand-tint/60 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold"><Boxes className="h-4 w-4 text-brand" />{unidadUnica ? 'Unidad con QR propio' : 'Lote'} · {lote.codigo}</p>
                <p className="mt-1 text-ink-soft">
                  {unidadUnica ? (lote.restante > 0 ? 'Disponible' : 'Ya salió') : `Quedan ${lote.restante} de ${lote.cantidad} ${art.unidad}`}
                  {lote.codigo_proveedor ? ` · N° proveedor ${lote.codigo_proveedor}` : ''} · compra {lote.factura_id}
                  {lote.vencimiento ? ` · vence ${formatFecha(lote.vencimiento)}` : ''}
                </p>
              </div>
            )}
          </div>

          {puedeMover && (
            <div className="space-y-3 rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><ArrowUpFromLine className="h-4 w-4 text-brand" />Descontar a una obra</p>
              <Select label="Obra de destino" placeholder="Elige la obra" value={form.obra_id} onChange={(e) => setForm({ ...form, obra_id: e.target.value })}
                options={obras.map((o) => ({ value: o.id, label: `${o.id} · ${o.nombre}` }))} />
              {unidadUnica ? (
                <p className="text-sm text-ink-soft">Sale 1 unidad (este QR identifica una sola).</p>
              ) : (
                <NumberField label="Cantidad" min={1} suffix={art.unidad} value={form.cantidad} onChange={(v) => setForm({ ...form, cantidad: v })}
                  error={excede ? `Disponible: ${tope} ${art.unidad}${lote ? ' en este lote' : ''}` : undefined}
                  hint={!excede ? `Disponible: ${tope} ${art.unidad}${lote ? ' en este lote' : ''}` : undefined} />
              )}
              <Button className="w-full" icon={ArrowUpFromLine} loading={guardando} disabled={!valido} onClick={descontar}>Registrar salida</Button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {can(rol, 'compras.registrar') && (
              <Button variant="secondary" icon={ShoppingCart} onClick={() => { onClose(); navigate('/erp/compras?nueva=1') }}>Sumar stock: registrar compra</Button>
            )}
            {can(rol, 'conteo.registrar') && (
              <Button variant="secondary" icon={ClipboardCheck} onClick={() => { onClose(); navigate(`/erp/bodega?tab=conteo&articulo=${art.id}`) }}>Contar este producto</Button>
            )}
            <Button variant="secondary" icon={History} onClick={() => { onClose(); navigate(`/erp/bodega?tab=cardex&articulo=${art.id}`) }}>Ver movimientos</Button>
          </div>
          <Button variant="ghost" className="w-full" icon={ScanLine} onClick={() => { setSeleccion(null); setLoteId(null) }}>Escanear otro</Button>
        </div>
      )}
    </Modal>
  )
}
