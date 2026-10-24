import { Drawer, Mono, Badge } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { calcularFactura, calcularNeto } from '@/domain/money'
import { formatFecha } from '@/domain/format'

export function FacturaDetalle({ factura, proveedor, articulos, onClose }) {
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
