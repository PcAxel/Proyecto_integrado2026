import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Minus, Plus, ScanLine, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Modal, Button, Badge, NumberField, Mono, IconButton } from '@/components/ui'
import { articulosService, lotesService, retirosService } from '@/services'
import { resolverCodigo } from '@/domain/etiquetas'
import { runAction } from '@/hooks/runAction'
import { EscanerQr } from './EscanerQr'
import { ConfirmarLecturaModal } from './ConfirmarLecturaModal'

/** Suma de lo escaneado de un artículo. */
const escaneado = (escaneos, articuloId) => escaneos.filter((e) => e.articulo_id === articuloId).reduce((s, e) => s + e.cantidad, 0)

/**
 * Picking de una solicitud de retiro: se escanean los productos (QR o SKU); cada lectura espera la confirmación de la persona (producto + stock real)
 * y recién entonces una tabla temporal suma lo leído contra lo pedido. «Confirmar retiro» envía el arreglo al servidor,
 * que descuenta el stock y deja una SALIDA_RETIRO por línea en el Cardex.
 * Lo escaneado debe coincidir exactamente con lo solicitado: no se puede pasar de la cantidad pedida ni confirmar incompleto.
 */
export function RetiroEscaneoModal({ open, onClose, retiro, onDone }) {
  const [articulos, setArticulos] = useState([])
  const [lotes, setLotes] = useState([])
  const [escaneos, setEscaneos] = useState([]) // [{ articulo_id, lote_id|null, cantidad }]
  const [porLectura, setPorLectura] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState(null) // lectura esperando confirmación
  const [leyendo, setLeyendo] = useState(false)

  useEffect(() => {
    if (!open) return
    setEscaneos([]); setPorLectura(1); setPendiente(null); setLeyendo(false)
    Promise.all([articulosService.list({ incluirInactivos: true }), lotesService.list()])
      .then(([a, l]) => { setArticulos(a); setLotes(l) })
      .catch((e) => toast.error(e.message))
  }, [open])

  const filas = useMemo(() => retiro.items.map((it) => {
    const hecho = escaneado(escaneos, it.articulo_id)
    return { ...it, hecho, falta: it.cantidad - hecho, completo: hecho === it.cantidad }
  }), [retiro, escaneos])
  const completo = filas.every((f) => f.completo)
  const totalHecho = filas.reduce((s, f) => s + f.hecho, 0)
  const totalPedido = filas.reduce((s, f) => s + f.cantidad, 0)

  /** Qué pasaría al leer `n` unidades de un artículo (y lote): `{error}` o `{cant}`. No cambia nada. */
  const evaluar = (articulo, lote, n) => {
    const fila = filas.find((f) => f.articulo_id === articulo.id)
    if (!fila) return { error: `${articulo.sku} no está en esta solicitud.` }
    if (fila.completo) return { error: `${articulo.sku} ya está completo (${fila.cantidad}).` }
    let cant = Math.min(n, fila.falta)
    if (lote) {
      const usado = escaneos.filter((e) => e.lote_id === lote.id).reduce((s, e) => s + e.cantidad, 0)
      const libre = lote.restante - usado
      if (libre <= 0) return { error: `El lote ${lote.codigo} no tiene unidades disponibles.` }
      cant = lote.tipo === 'SERIE' ? 1 : Math.min(cant, libre)
    }
    return { cant, fila }
  }

  /** Suma al retiro (ya confirmado por la persona). Devuelve el error o null. */
  const sumar = (articulo, lote, n) => {
    const ev = evaluar(articulo, lote, n)
    if (ev.error) return ev.error
    setEscaneos((es) => {
      const i = es.findIndex((e) => e.articulo_id === articulo.id && (e.lote_id ?? null) === (lote?.id ?? null))
      return i >= 0 ? es.map((e, k) => (k === i ? { ...e, cantidad: e.cantidad + ev.cant } : e)) : [...es, { articulo_id: articulo.id, lote_id: lote?.id ?? null, cantidad: ev.cant }]
    })
    return null
  }

  /** Safe picking: un código leído NO se suma al retiro; primero se muestra el producto y su stock real y la persona confirma o descarta. */
  const alLeer = async (texto) => {
    if (leyendo || pendiente) return
    const r = resolverCodigo(texto, articulos, lotes)
    if (!r.ok) { toast.error(r.error); return }
    const ev = evaluar(r.articulo, r.lote, porLectura || 1)
    if (ev.error) { toast.error(ev.error); return }
    setLeyendo(true) // la cámara se pausa mientras se consulta el stock y se espera la respuesta
    try {
      const [fresco, lotesFrescos] = await Promise.all([articulosService.retrieve(r.articulo.id), r.lote ? lotesService.list() : Promise.resolve(lotes)])
      const lote = r.lote ? lotesFrescos.find((l) => l.id === r.lote.id) ?? r.lote : null
      const ev2 = evaluar(fresco, lote, porLectura || 1)
      if (ev2.error) { toast.error(ev2.error); return }
      setPendiente({ articulo: fresco, lote, cantidad: ev2.cant, stock: fresco.stock, enRetiro: ev2.fila.hecho, pedido: ev2.fila.cantidad })
    } catch (e) {
      toast.error(e.message || 'No se pudo consultar el stock. Intenta de nuevo.')
    } finally {
      setLeyendo(false)
    }
  }
  const confirmarLectura = () => {
    const { articulo, lote, cantidad } = pendiente
    const error = sumar(articulo, lote, cantidad)
    setPendiente(null)
    if (error) toast.error(error)
    else toast.success(`${lote?.codigo ?? articulo.sku}: ${cantidad} ${articulo.unidad} al retiro`, { duration: 1500 })
  }

  const quitarUna = (articuloId) => setEscaneos((es) => {
    const i = es.map((e) => e.articulo_id).lastIndexOf(articuloId)
    if (i < 0) return es
    return es.flatMap((e, k) => (k !== i ? [e] : e.cantidad > 1 ? [{ ...e, cantidad: e.cantidad - 1 }] : []))
  })
  const sumarManual = (articuloId) => {
    const a = articulos.find((x) => x.id === articuloId)
    if (a) { const error = sumar(a, null, 1); if (error) toast.error(error) }
  }

  const confirmar = async () => {
    setGuardando(true)
    const r = await runAction(retirosService.entregarEscaneado(retiro.id, escaneos), 'Retiro confirmado: salidas registradas en el Cardex')
    setGuardando(false)
    if (r) { onDone?.(); onClose() }
  }

  return (
    <Modal open={open} onClose={() => { if (!pendiente && !leyendo) onClose() }} title={`Retiro ${retiro.id}`} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={CheckCircle2} onClick={confirmar} loading={guardando} disabled={!completo}>Confirmar retiro</Button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Para <b>{retiro.obra_nombre}</b> · {retiro.tecnico_nombre}. Escanea cada producto; la tabla suma lo leído contra lo pedido.</p>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><ScanLine className="h-4 w-4 text-brand" />Previsualización del retiro</p>
            <Mono className="text-xs text-ink-soft" aria-live="polite">{totalHecho} / {totalPedido} unidades</Mono>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-soft">
              <th className="py-2 font-medium">Artículo</th><th className="py-2 text-right font-medium">Pedido</th><th className="py-2 text-right font-medium">Escaneado</th><th className="py-2 text-right font-medium">Ajustar</th>
            </tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.articulo_id} className="border-b border-line last:border-0">
                  <td className="py-2">
                    <p>{f.nombre}</p>
                    <Mono className="text-xs text-ink-soft">{f.sku}</Mono>
                    {f.stock !== undefined && f.stock < f.cantidad && <p className="text-[11px] font-medium text-crit">Stock insuficiente ({f.stock})</p>}
                  </td>
                  <td className="py-2 text-right"><Mono>{f.cantidad} {f.unidad}</Mono></td>
                  <td className="py-2 text-right">
                    <Mono className={f.completo ? 'font-semibold text-ok' : f.hecho ? 'font-semibold' : 'text-ink-faint'}>{f.hecho}</Mono>
                    <div className="mt-0.5">{f.completo ? <Badge tone="ok" icon={CheckCircle2}>Completo</Badge> : <span className="text-[11px] text-warn">Faltan {f.falta}</span>}</div>
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-0.5">
                      <IconButton icon={Minus} label={`Quitar una unidad de ${f.sku}`} size="sm" disabled={f.hecho === 0} onClick={() => quitarUna(f.articulo_id)} />
                      <IconButton icon={Plus} label={`Agregar una unidad de ${f.sku} a mano`} size="sm" disabled={f.completo} onClick={() => sumarManual(f.articulo_id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {escaneos.length > 0 && (
            <Button className="mt-2" variant="ghost" size="sm" icon={RotateCcw} onClick={() => setEscaneos([])}>Vaciar lectura</Button>
          )}
        </div>
        <EscanerQr onCodigo={alLeer} compacto pausado={leyendo || Boolean(pendiente)} />
        <div className="max-w-[12rem]">
          <NumberField label="Unidades por lectura" min={1} value={porLectura} onChange={(v) => setPorLectura(v ?? 1)} hint="Para cantidades grandes" />
        </div>

        {!completo && <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft">«Confirmar retiro» se habilita cuando lo escaneado coincide con lo solicitado. Si falta stock, rechaza la solicitud desde su ficha.</p>}
      </div>
      <ConfirmarLecturaModal lectura={pendiente} onConfirmar={confirmarLectura} onCancelar={() => setPendiente(null)} />
    </Modal>
  )
}
