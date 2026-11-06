import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import SignatureCanvas from 'react-signature-canvas'
import { ArrowLeft, ChevronLeft, ChevronRight, Eraser, PenLine, Download, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/components/ui'
import { rrhhService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { formatFechaHora } from '@/domain/format'
import { tituloDocumento } from '@/domain/firma'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

/** Ancho disponible del contenedor: el PDF y el lienzo se ajustan al teléfono. */
function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(320)
  useEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

function Visor({ bytes, ancho }) {
  const [paginas, setPaginas] = useState(0)
  const [n, setN] = useState(1)
  const [error, setError] = useState(false)
  // react-pdf transfiere el buffer al worker: se le entrega una copia para poder reabrirlo.
  const archivo = useRef(null)
  if (bytes && !archivo.current) archivo.current = { data: bytes.slice() }
  if (error) return <p role="alert" className="rounded-2xl bg-crit-bg p-4 text-base font-semibold text-crit">No se pudo mostrar el documento. Avisa a Recursos Humanos.</p>
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border-2 border-line-strong bg-slate-100">
        <Document file={archivo.current} onLoadSuccess={({ numPages }) => setPaginas(numPages)} onLoadError={() => setError(true)}
          loading={<div className="h-72 animate-pulse bg-slate-200" />} error={null}>
          <Page pageNumber={n} width={ancho - 4} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
      {paginas > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setN((x) => Math.max(1, x - 1))} disabled={n === 1} aria-label="Página anterior"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-line-strong bg-white disabled:opacity-40"><ChevronLeft className="h-7 w-7" /></button>
          <p className="text-lg font-semibold">Página {n} de {paginas}</p>
          <button type="button" onClick={() => setN((x) => Math.min(paginas, x + 1))} disabled={n === paginas} aria-label="Página siguiente"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-line-strong bg-white disabled:opacity-40"><ChevronRight className="h-7 w-7" /></button>
        </div>
      )}
    </div>
  )
}

/**
 * Lee el documento y lo firma dibujando con el dedo. El servidor fija la IP y la hora, exige el código 2FA del titular
 * y sella el PDF. La firma se dibuja para este documento: no se guarda ni se reutiliza.
 */
export function VistaFirmaDocumento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const doc = useResource(() => rrhhService.miDocumento(id), [id])
  const [bytes, setBytes] = useState(null)
  const [errorPdf, setErrorPdf] = useState(null)
  const lienzo = useRef(null)
  const [refAncho, ancho] = useAncho()
  const [dibujado, setDibujado] = useState(false)
  const [leido, setLeido] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [firmado, setFirmado] = useState(null)

  useEffect(() => {
    let vivo = true
    rrhhService.bytesMiDocumento(id).then((b) => vivo && setBytes(b)).catch((e) => vivo && setErrorPdf(e.message))
    return () => { vivo = false }
  }, [id])

  const limpiar = useCallback(() => { lienzo.current?.clear(); setDibujado(false); setError('') }, [])

  const firmar = async () => {
    if (!lienzo.current || lienzo.current.isEmpty()) return setError('Dibuja tu firma en el recuadro.')
    if (!/^\d{6}$/.test(codigo)) return setError('Escribe los 6 números de tu app de verificación.')
    setEnviando(true)
    setError('')
    try {
      const png = lienzo.current.toDataURL('image/png')
      const r = await rrhhService.firmarDocumento(id, png, codigo)
      setFirmado(r)
      toast.success('Documento firmado.')
    } catch (e) {
      setError(e.message)
      setCodigo('')
    } finally { setEnviando(false) }
  }

  const d = doc.data
  const yaFirmado = firmado ?? (d?.estado === 'FIRMADO' ? d : null)

  return (
    <div className="space-y-5 pb-24">{/* el espacio final evita que el botón flotante del asistente tape «Firmar» */}
      <Link to="/app/documentos" className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark"><ArrowLeft className="h-5 w-5" />Mis documentos</Link>
      <div>
        <h1 className="t-display text-[2rem] leading-none text-ink">{d ? tituloDocumento(d) : 'Documento'}</h1>
        {yaFirmado ? null : <p className="mt-2 text-lg text-ink-soft">Lee el documento completo y firma abajo.</p>}
      </div>

      <div ref={refAncho}>
        {errorPdf ? <p role="alert" className="rounded-2xl bg-crit-bg p-4 text-base font-semibold text-crit">{errorPdf}</p>
          : bytes ? <Visor bytes={bytes} ancho={ancho} /> : <div className="h-72 animate-pulse rounded-2xl bg-slate-200" />}
      </div>

      {yaFirmado ? (
        <section className="space-y-3 rounded-3xl border-2 border-ok bg-ok-bg p-5">
          <p className="flex items-center gap-2 text-xl font-bold text-ok"><CheckCircle2 className="h-7 w-7" />Documento firmado</p>
          <p className="text-base text-ink">Firmado el {formatFechaHora(yaFirmado.fecha_firma)}. Quedó registrado con tu identidad verificada.</p>
          <button type="button" onClick={() => rrhhService.descargarMiDocumentoFirmado(id).catch((e) => toast.error(e.message))}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-ok ring-2 ring-ok"><Download className="h-6 w-6" />Descargar PDF firmado</button>
          <button type="button" onClick={() => navigate('/app/documentos')} className="min-h-12 w-full text-lg font-semibold text-ink-soft">Volver</button>
        </section>
      ) : d && (
        <section className="space-y-4 rounded-3xl border-2 border-line-strong bg-white p-4">
          <h2 className="t-display text-[1.5rem] text-ink">Tu firma</h2>
          <div className="rounded-2xl border-2 border-dashed border-line-strong bg-slate-50">
            <SignatureCanvas ref={lienzo} penColor="#111827" minWidth={1.5} maxWidth={3.5} onEnd={() => setDibujado(!lienzo.current?.isEmpty())}
              canvasProps={{ width: Math.max(ancho - 36, 220), height: 180, className: 'block touch-none rounded-2xl', 'aria-label': 'Recuadro para dibujar tu firma' }} />
          </div>
          <p className="text-center text-base text-ink-soft">Dibuja con el dedo dentro del recuadro.</p>

          <label className="flex items-start gap-3 text-lg">
            <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
            <span>Leí el documento y estoy de acuerdo.</span>
          </label>
          <label className="block">
            <span className="text-lg font-semibold">Código de tu app de verificación</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="mt-1 h-14 w-full rounded-2xl border-2 border-line-strong px-4 text-center font-mono text-2xl tracking-[0.4em]" placeholder="000000" />
            <span className="mt-1 block text-sm text-ink-soft">Es el mismo código de 6 números con el que entras a la app. Confirma que eres tú.</span>
          </label>
          {error && <p role="alert" className="rounded-2xl bg-crit-bg p-3 text-base font-semibold text-crit">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={limpiar} disabled={enviando}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-line-strong bg-white text-xl font-bold disabled:opacity-50"><Eraser className="h-6 w-6" />Limpiar</button>
            <button type="button" onClick={firmar} disabled={enviando || !dibujado || !leido || codigo.length !== 6}
              className={cn('flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-ok text-xl font-bold text-white disabled:opacity-40')}>
              <PenLine className="h-6 w-6" />{enviando ? 'Firmando…' : 'Firmar'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
