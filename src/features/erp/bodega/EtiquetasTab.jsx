import { useMemo, useState } from 'react'
import { Printer, Download, QrCode, Boxes, PackagePlus, Info } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button, Card, DataTable, Input, Select, NumberField, Mono, Badge, cn } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { articulosService, lotesService } from '@/services'
import {
  FORMATOS_ETIQUETA, AMBIENTES_ETIQUETA, contenidoQr, paginasNecesarias, guiaImpresion, datosEtiquetaArticulo, datosEtiquetaLote,
} from '@/domain/etiquetas'
import { can } from '@/domain/rbac'
import { descargarEtiquetas, abrirEtiquetasParaImprimir } from '@/lib/etiquetas'
import { useAuthStore } from '@/stores/authStore'
import { useResource } from '@/hooks/useResource'
import { runAction } from '@/hooks/runAction'
import { formatFecha } from '@/domain/format'

const Casilla = ({ marcada, onChange, etiqueta }) => (
  <input type="checkbox" aria-label={etiqueta} checked={marcada} onChange={onChange} className="h-4 w-4 accent-brand" />
)

/** Alta de lotes o cilindros a partir de una compra: cada uno recibe su código y su QR. */
function CrearLotes({ onCreados }) {
  const { data: entradas, reload } = useResource(() => lotesService.entradasPorEtiquetar(), [])
  const [f, setF] = useState({ movimiento_id: '', tipo: 'SERIE', cantidad: null, codigo_proveedor: '', vencimiento: '' })
  const [guardando, setGuardando] = useState(false)
  const entrada = (entradas ?? []).find((e) => e.movimiento_id === f.movimiento_id)

  const elegir = (id) => {
    const e = (entradas ?? []).find((x) => x.movimiento_id === id)
    setF({ ...f, movimiento_id: id, cantidad: e ? e.pendientes : null })
  }
  const crear = async () => {
    setGuardando(true)
    const r = await runAction(lotesService.crear({ ...f, vencimiento: f.vencimiento || null }),
      f.tipo === 'SERIE' ? `${f.cantidad} unidad(es) con QR propio creadas` : 'Lote creado')
    setGuardando(false)
    if (r) { onCreados(r); reload(); setF({ movimiento_id: '', tipo: 'SERIE', cantidad: null, codigo_proveedor: '', vencimiento: '' }) }
  }

  return (
    <Card title="Crear lotes o cilindros" subtitle="Cada uno lleva su propio QR y queda ligado a la compra de la que salió" icon={PackagePlus}>
      {(entradas ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">No hay compras con unidades sin etiquetar. Registra una factura de compra en Compras y vuelve aquí.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Compra recibida" placeholder="Elige la entrada" value={f.movimiento_id} onChange={(e) => elegir(e.target.value)} className="md:col-span-2"
            options={entradas.map((e) => ({ value: e.movimiento_id, label: `${e.sku} · ${e.nombre} — ${e.factura_id} (${e.pendientes} de ${e.cantidad} sin etiquetar)` }))} />
          <fieldset className="space-y-2 md:col-span-2" disabled={!entrada}>
            <legend className="mb-1 text-[13px] font-medium text-ink">¿Cómo se etiqueta?</legend>
            {[['SERIE', 'Un QR por unidad', 'Cilindros de refrigerante, compresores o equipos con número de serie.'], ['LOTE', 'Un QR para todo el lote', 'Rollos, cajas o bultos que se manejan juntos.']].map(([v, t, d]) => (
              <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', f.tipo === v ? 'border-brand bg-brand-tint/50' : 'border-line')}>
                <input type="radio" name="tipo-lote" className="mt-1 accent-brand" checked={f.tipo === v} onChange={() => setF({ ...f, tipo: v })} />
                <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-ink-soft">{d}</span></span>
              </label>
            ))}
          </fieldset>
          <NumberField label={f.tipo === 'SERIE' ? 'Unidades a etiquetar' : 'Cantidad del lote'} min={1} max={entrada?.pendientes} suffix={entrada?.unidad} value={f.cantidad}
            onChange={(v) => setF({ ...f, cantidad: v })} hint={entrada ? `Máximo ${entrada.pendientes} ${entrada.unidad}` : undefined} />
          <Input label="N° de lote o serie del proveedor (opcional)" value={f.codigo_proveedor} onChange={(e) => setF({ ...f, codigo_proveedor: e.target.value })} />
          <Input label="Vencimiento (opcional)" type="date" value={f.vencimiento} onChange={(e) => setF({ ...f, vencimiento: e.target.value })} />
          <div className="flex items-end md:justify-end">
            <Button icon={PackagePlus} loading={guardando} disabled={!entrada || !(f.cantidad > 0) || f.cantidad > entrada.pendientes} onClick={crear}>
              {f.tipo === 'SERIE' && f.cantidad > 1 ? `Crear ${f.cantidad} QR` : 'Crear QR'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Generador de etiquetas QR por producto o por lote/cilindro: se eligen, se escoge el papel y sale un PDF para imprimir. */
export function EtiquetasTab() {
  const rol = useAuthStore((s) => s.user.rol)
  const [modo, setModo] = useState('PRODUCTO') // PRODUCTO | LOTE
  const articulos = useResource(() => articulosService.list(), [])
  const lotes = useResource(() => lotesService.list(), [])
  const [q, setQ] = useState('')
  const [elegidos, setElegidos] = useState(() => new Set())
  const [formato, setFormato] = useState('A4_24')
  const [ambiente, setAmbiente] = useState('SECO')
  const [copias, setCopias] = useState(1)
  const [trabajando, setTrabajando] = useState(false)

  const porLote = modo === 'LOTE'
  const arts = articulos.data ?? []
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return porLote
      ? (lotes.data ?? []).filter((l) => !t || `${l.codigo} ${l.articulo_nombre} ${l.codigo_proveedor ?? ''}`.toLowerCase().includes(t))
      : arts.filter((a) => !t || `${a.sku} ${a.nombre}`.toLowerCase().includes(t))
  }, [porLote, lotes.data, arts, q])
  const seleccion = (porLote ? (lotes.data ?? []) : arts).filter((x) => elegidos.has(x.id))
  const etiquetas = seleccion.flatMap((x) => {
    const datos = porLote ? datosEtiquetaLote(x, arts.find((a) => a.id === x.articulo_id) ?? { unidad: x.unidad, nombre: x.articulo_nombre }) : datosEtiquetaArticulo(x)
    return Array.from({ length: porLote ? 1 : copias }, () => datos)
  })
  const f = FORMATOS_ETIQUETA[formato]
  const amb = AMBIENTES_ETIQUETA[ambiente]
  const vista = etiquetas[0]

  const cambiarModo = (m) => { setModo(m); setElegidos(new Set()); setQ('') }
  const alternar = (id) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosVisibles = filas.length > 0 && filas.every((x) => elegidos.has(x.id))
  const alternarVisibles = () => setElegidos((s) => { const n = new Set(s); filas.forEach((x) => (todosVisibles ? n.delete(x.id) : n.add(x.id))); return n })
  const alCrear = (creados) => { lotes.reload(); setElegidos(new Set(creados.map((l) => l.id))) } // quedan listos para imprimir

  const ejecutar = (fn) => async () => {
    setTrabajando(true)
    try { await fn(etiquetas, formato, ambiente) } catch (e) { toast.error(e.message || 'No se pudo generar el PDF.') } finally { setTrabajando(false) }
  }

  const cabecera = <Casilla marcada={todosVisibles} onChange={alternarVisibles} etiqueta="Elegir todos los visibles" />
  const columns = porLote ? [
    { key: 'sel', header: cabecera, render: (l) => <Casilla marcada={elegidos.has(l.id)} onChange={() => alternar(l.id)} etiqueta={`Elegir ${l.codigo}`} /> },
    { key: 'codigo', header: 'Código', mono: true },
    { key: 'articulo', header: 'Artículo', render: (l) => <div><p className="font-medium">{l.articulo_nombre}</p><p className="text-xs text-ink-soft">{l.codigo_proveedor ? `Proveedor: ${l.codigo_proveedor} · ` : ''}{l.factura_id}</p></div> },
    { key: 'tipo', header: 'Tipo', render: (l) => <Badge tone="neutral">{l.tipo === 'SERIE' ? 'Unidad' : 'Lote'}</Badge> },
    { key: 'restante', header: 'Queda', align: 'right', render: (l) => <Mono className={l.restante <= 0 ? 'text-ink-faint' : ''}>{l.restante} / {l.cantidad} {l.unidad}</Mono> },
    { key: 'vence', header: 'Vence', mono: true, render: (l) => (l.vencimiento ? formatFecha(l.vencimiento) : '—') },
  ] : [
    { key: 'sel', header: cabecera, render: (a) => <Casilla marcada={elegidos.has(a.id)} onChange={() => alternar(a.id)} etiqueta={`Elegir ${a.sku}`} /> },
    { key: 'sku', header: 'SKU', mono: true },
    { key: 'nombre', header: 'Artículo' },
    { key: 'unidad', header: 'Unidad', mono: true },
  ]
  const recurso = porLote ? lotes : articulos

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Tipo de etiqueta" className="inline-flex rounded-lg border border-line-strong bg-white p-1">
        {[['PRODUCTO', 'Por producto', QrCode], ['LOTE', 'Por lote o cilindro', Boxes]].map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={modo === id} onClick={() => cambiarModo(id)}
            className={cn('flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors', modo === id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-slate-100')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {porLote && can(rol, 'cardex.crear') && <CrearLotes onCreados={alCrear} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card padded={false}>
          {recurso.error ? <ErrorEstado error={recurso.error} onReintentar={recurso.reload} /> : (
            <>
              <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
                <Input label="Buscar" placeholder={porLote ? 'Código, artículo o N° del proveedor' : 'SKU o nombre'} value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-72" />
                <Mono className="ml-auto pb-2 text-xs text-ink-soft">{seleccion.length} elegidos · {filas.length} visibles</Mono>
              </div>
              <DataTable columns={columns} rows={filas} rowKey={(x) => x.id} loading={recurso.loading && !recurso.data}
                emptyTitle={porLote ? 'Sin lotes ni cilindros' : 'Sin artículos'} emptyHint={porLote ? 'Crea uno desde una compra recibida.' : 'No hay artículos para mostrar.'} />
            </>
          )}
        </Card>

        <Card title="Impresión" icon={Printer}>
          <div className="space-y-4">
            <Select label="Papel / formato" value={formato} onChange={(e) => setFormato(e.target.value)}
              options={Object.values(FORMATOS_ETIQUETA).map((x) => ({ value: x.id, label: x.nombre }))} />
            <Select label="¿Dónde se usará?" value={ambiente} onChange={(e) => setAmbiente(e.target.value)}
              options={Object.values(AMBIENTES_ETIQUETA).map((x) => ({ value: x.id, label: x.nombre }))} />
            {!porLote && <Input label="Copias por artículo" type="number" min={1} max={50} value={copias} onChange={(e) => setCopias(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />}
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-white p-3">
              {vista ? (
                <>
                  <QRCodeSVG value={contenidoQr(vista)} size={72} level={amb.correccion} marginSize={1} />
                  <div className="min-w-0"><p className="font-mono text-sm font-bold">{vista.codigo}</p><p className="line-clamp-2 text-xs text-ink-soft">{vista.nombre}</p><p className="text-xs text-ink-faint">{vista.detalle}</p></div>
                </>
              ) : <p className="text-sm text-ink-soft">Elige {porLote ? 'lotes o cilindros' : 'artículos'} para ver la vista previa.</p>}
            </div>
            <p className="text-xs text-ink-soft">{etiquetas.length} etiqueta{etiquetas.length === 1 ? '' : 's'} · {paginasNecesarias(f, etiquetas.length)} página{paginasNecesarias(f, etiquetas.length) === 1 ? '' : 's'}</p>
            <div className="grid gap-2">
              <Button icon={Printer} disabled={!etiquetas.length} loading={trabajando} onClick={ejecutar(abrirEtiquetasParaImprimir)}>Abrir para imprimir</Button>
              <Button variant="secondary" icon={Download} disabled={!etiquetas.length} loading={trabajando} onClick={ejecutar(descargarEtiquetas)}>Descargar PDF</Button>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink"><Info className="h-3.5 w-3.5" />Al imprimir</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-ink-soft">{guiaImpresion(f, amb).map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
