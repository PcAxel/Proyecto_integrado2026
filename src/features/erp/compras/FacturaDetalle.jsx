import { useState } from 'react'
import { toast } from 'sonner'
import { Drawer, Mono, Badge, Button, Modal, Textarea } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { calcularFactura, calcularNeto } from '@/domain/money'
import { formatFecha, formatFechaHora } from '@/domain/format'
import { ESTADO_CONCILIACION, describirDiscrepancia, motivoLiberacionValido } from '@/domain/conciliacion'
import { can } from '@/domain/rbac'
import { comprasService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { runAction } from '@/hooks/runAction'

/** Bloque de conciliación: qué estado tiene la factura frente a su orden de compra y recepciones, y (con permiso) el botón para liberarla. */
function Conciliacion({ factura, c, onLiberada }) {
  const rol = useAuthStore((s) => s.user.rol)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const e = ESTADO_CONCILIACION[c.estado]
  const puedeLiberar = c.estado === 'BLOQUEADA_POR_DISCREPANCIA' && can(rol, 'compras.liberar_factura')
  const liberar = async () => {
    setGuardando(true)
    const r = await runAction(comprasService.liberarFactura(factura.id, motivo.trim()), 'Factura liberada: el motivo quedó en la auditoría')
    setGuardando(false)
    if (r) { setAbierto(false); setMotivo(''); onLiberada?.() }
  }
  return (
    <div className="rounded-xl border border-line p-4 text-sm" data-testid="conciliacion">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Conciliación con la orden de compra</p>
        <Badge tone={e.tone}>{e.label}</Badge>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{e.ayuda}{c.orden_compra_id ? <> Orden: <Mono>{c.orden_compra_id}</Mono>.</> : null}</p>
      {c.discrepancias.length > 0 && (
        <ul className="mt-3 space-y-1">
          {c.discrepancias.map((d, i) => <li key={i} className="rounded-md bg-crit-bg px-3 py-1.5 text-xs text-crit">{describirDiscrepancia(d)}</li>)}
        </ul>
      )}
      {c.estado === 'BLOQUEADA_POR_DISCREPANCIA' && <p className="mt-2 text-sm font-medium text-crit">Retenido: <MoneyCell value={c.monto_retenido} className="inline" /> (con IVA)</p>}
      {c.estado === 'PENDIENTE_RECEPCION' && <p className="mt-2 text-xs text-ink-soft">Esperando recepción por <MoneyCell value={c.monto_pendiente_recepcion} className="inline" /> netos.</p>}
      {c.liberacion && <p className="mt-2 text-xs text-ink-soft">Liberada el {formatFechaHora(c.liberacion.fecha)}: «{c.liberacion.motivo}»</p>}
      {puedeLiberar && (
        <>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => setAbierto(true)}>Liberar factura…</Button>
          <Modal open={abierto} onClose={() => setAbierto(false)} title={`Liberar factura N° ${factura.numero}`}
            footer={<><Button variant="secondary" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={liberar} loading={guardando} disabled={!motivoLiberacionValido(motivo)}>Liberar</Button></>}>
            <p className="mb-3 text-sm text-ink-soft">La factura deja de estar bloqueada. Queda registrado quién la liberó y por qué, y no se puede deshacer.</p>
            <Textarea label="Motivo de la liberación" obligatorio value={motivo} onChange={(ev) => setMotivo(ev.target.value)} hint="Mínimo 10 caracteres. Ej.: «La guía 88 trae las 3 unidades que faltaban»." />
          </Modal>
        </>
      )}
    </div>
  )
}

export function FacturaDetalle({ factura, proveedor, articulos, conciliacion, onLiberada, onClose }) {
  const calc = factura && calcularFactura(factura.items, factura.descuentos)
  const art = (id) => articulos.find((a) => a.id === id)
  return (
    <Drawer open={Boolean(factura)} onClose={onClose} title={factura ? `Factura N° ${factura.numero}` : ''} width="max-w-2xl">
      {factura && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div><p className="font-medium">{proveedor?.razon_social}</p><Mono className="text-xs text-ink-soft">{proveedor?.rut} · {factura.id}</Mono></div>
            <div className="text-right"><Badge tone="ok">{factura.estado === 'REGISTRADA' ? 'Registrada' : factura.estado}</Badge><p className="mt-1"><Mono className="text-xs text-ink-soft">{formatFecha(factura.fecha)}</Mono></p></div>
          </div>
          {conciliacion && <Conciliacion factura={factura} c={conciliacion} onLiberada={onLiberada} />}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-soft"><th className="py-2 font-medium">Artículo</th><th className="py-2 text-right font-medium">Cant.</th><th className="py-2 text-right font-medium">P. lista</th><th className="py-2 text-right font-medium">Costo neto</th></tr></thead>
            <tbody>
              {factura.items.map((it) => (
                <tr key={it.articulo_id} className="border-b border-line last:border-0">
                  <td className="py-2">{art(it.articulo_id)?.nombre ?? it.articulo_id}<br /><Mono className="text-xs text-ink-soft">{art(it.articulo_id)?.sku}</Mono></td>
                  <td className="py-2 text-right"><Mono>{it.cantidad}</Mono></td>
                  <td className="py-2 text-right"><MoneyCell value={it.precio_lista} /></td>
                  <td className="py-2 text-right"><MoneyCell value={calcularNeto(it.precio_lista, factura.descuentos)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rounded-xl border border-line bg-slate-50 p-4 text-sm">
            <div className="flex justify-between py-0.5 text-ink-soft"><span>Subtotal bruto</span><MoneyCell value={calc.bruto} /></div>
            {calc.pasos.map((p, i) => <div key={i} className="flex justify-between py-0.5 text-ink-soft"><span>Descuento {i + 1} ({p.pct}%)</span><MoneyCell value={-p.monto} className="text-ok" /></div>)}
            <div className="flex justify-between py-0.5 font-medium"><span>Neto</span><MoneyCell value={factura.neto} /></div>
            <div className="flex justify-between py-0.5 text-ink-soft"><span>IVA 19 %</span><MoneyCell value={factura.iva} /></div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><MoneyCell value={factura.total} /></div>
          </div>
          {factura.notas_credito?.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Notas de crédito asociadas</p>
              {factura.notas_credito.map((n) => (
                <div key={n.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                  <div><Mono>{n.id}</Mono> · N° {n.numero}<p className="text-xs text-ink-soft">{n.motivo}</p></div>
                  <MoneyCell value={-n.total} className="text-ok" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
