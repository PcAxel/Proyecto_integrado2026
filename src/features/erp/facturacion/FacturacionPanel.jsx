import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, FileText, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Mono, StatusBadge, cn } from '@/components/ui'
import { MoneyCell } from '@/components/domain'
import { facturacionService } from '@/services'
import { ESTADO_SII, mensajeErrorEmision, modoPanel } from '@/domain/facturacion'
import { can } from '@/domain/rbac'
import { useAuthStore } from '@/stores/authStore'

/**
 * Panel de facturación electrónica (SII) de una obra finalizada.
 * - Solo se dibuja si la sesión es de Administrador o Finanzas (la misma matriz de permisos del servidor); para cualquier otro rol no existe en la pantalla.
 *   Aun así el servidor exige el JWT y responde 403: ocultar el botón es comodidad, no seguridad.
 * - Al emitir, el botón se bloquea (gris/naranja) con «Procesando en SII…»; al recibir el 200 pasa a verde («Aceptado») y ofrece el PDF.
 * @param {{obraId: string, resaltar?: boolean}} props  `obraId`: id de la obra (la orden que se factura) · `resaltar`: la destaca un momento (cuando el asistente de IA lleva hasta aquí)
 */
export function FacturacionPanel({ obraId, resaltar = false }) {
  const rol = useAuthStore((s) => s.user?.rol)
  const permitido = can(rol, 'facturacion.emitir')
  const [dte, setDte] = useState(null)
  const [emitiendo, setEmitiendo] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState(null)
  const montado = useRef(true)
  // Se vuelve a marcar al montar: en desarrollo React monta, desmonta y vuelve a montar, y sin esto se descartarían todas las respuestas.
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])

  const cargar = useCallback(async () => {
    try { const r = await facturacionService.estado(obraId); if (montado.current) setDte(r) } catch (e) { if (montado.current) setError(mensajeErrorEmision(e)) }
  }, [obraId])
  useEffect(() => { if (permitido) cargar() }, [permitido, cargar])

  if (!permitido) return null // render condicional por rol

  const emitir = async () => {
    if (emitiendo) return // un segundo clic no emite dos veces
    setEmitiendo(true)
    setError(null)
    try {
      const r = await facturacionService.emitir(obraId)
      if (!montado.current) return
      setDte(r)
      toast.success(`Factura electrónica aceptada · folio ${r.folio_sii}`)
    } catch (e) {
      if (!montado.current) return
      setError(mensajeErrorEmision(e))
      await cargar() // el servidor puede haber quedado en «Rechazado» o «Ya emitida»: se muestra su estado real
    } finally {
      if (montado.current) setEmitiendo(false)
    }
  }

  const descargar = async () => {
    setBajando(true)
    try { await facturacionService.descargarPdf(obraId, dte.folio_sii) } catch (e) { toast.error(e?.message || 'No se pudo descargar el PDF.') } finally { if (montado.current) setBajando(false) }
  }

  const modo = modoPanel(dte, emitiendo)
  const estado = ESTADO_SII[dte?.estado_sii] ?? ESTADO_SII.NO_EMITIDO
  const verde = modo === 'aceptado'

  return (
    <div id="facturacion" className={cn('scroll-mt-24 rounded-xl transition-shadow duration-500', resaltar && 'ring-4 ring-brand/60 ring-offset-2 ring-offset-surface')}>
    <Card title="Facturación electrónica (SII)" subtitle="Factura del trabajo finalizado" icon={FileText}>
      <div className="space-y-4" aria-live="polite">
        {dte && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge type={modo === 'procesando' ? 'warning' : estado.type} label={modo === 'procesando' ? 'Procesando' : estado.label} />
            {dte.folio_sii && <Mono className="text-xs text-ink-soft">Folio {dte.folio_sii}</Mono>}
          </div>
        )}

        {dte && modo !== 'bloqueado' && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-ink-soft">Cliente</dt><dd className="font-medium">{dte.receptor_razon_social} <Mono className="text-xs text-ink-soft">{dte.receptor_rut}</Mono></dd></div>
            <div><dt className="text-xs text-ink-soft">Neto</dt><dd><MoneyCell value={dte.neto} /></dd></div>
            <div><dt className="text-xs text-ink-soft">IVA (19 %)</dt><dd><MoneyCell value={dte.iva} /></dd></div>
            <div className="sm:col-span-2 border-t border-line pt-2"><dt className="text-xs text-ink-soft">Total</dt><dd className="text-base font-semibold"><MoneyCell value={dte.total} /></dd></div>
          </dl>
        )}

        {modo === 'bloqueado' && <p className="rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">{dte?.motivo ?? 'Esta orden no se puede facturar todavía.'}</p>}
        {error && <p role="alert" className="rounded-lg bg-crit-bg p-3 text-sm font-medium text-crit">{error}</p>}

        {(modo === 'emitir' || modo === 'rechazado') && (
          <Button icon={Send} onClick={emitir} className="w-full">{modo === 'rechazado' ? 'Reintentar emisión (SII)' : 'Emitir Factura Electrónica (SII)'}</Button>
        )}

        {modo === 'procesando' && (
          // Gris/naranja, bloqueado y con spinner mientras el servidor habla con el SII.
          <button type="button" disabled aria-busy="true"
            className="flex h-11 w-full cursor-wait items-center justify-center gap-2 rounded-lg border border-warn/40 bg-warn-bg px-4 text-sm font-semibold text-warn">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Procesando en SII...
          </button>
        )}

        {verde && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-ok/40 bg-ok-bg px-3 py-2.5 text-sm font-semibold text-ok" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Aceptado por el SII
            </div>
            <Button variant="secondary" icon={Download} onClick={descargar} loading={bajando} className="w-full">Descargar PDF</Button>
          </div>
        )}

        {!dte && !error && <p className="text-sm text-ink-soft">Cargando estado de la factura…</p>}
        <p className="text-[11px] leading-snug text-ink-faint">Entorno de pruebas: el proveedor es simulado, el documento no tiene validez tributaria ni se envía al SII.</p>
      </div>
    </Card>
    </div>
  )
}
