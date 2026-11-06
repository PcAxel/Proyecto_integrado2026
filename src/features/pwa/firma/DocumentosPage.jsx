import { Link } from 'react-router-dom'
import { FileSignature, CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { useResource } from '@/hooks/useResource'
import { rrhhService } from '@/services'
import { formatFecha } from '@/domain/format'
import { tituloDocumento } from '@/domain/firma'

/** Mis documentos laborales: primero los pendientes por firmar. */
export function DocumentosPage() {
  const { data, loading, error, reload } = useResource(() => rrhhService.misDocumentos(), [])
  if (error) return <ErrorEstado error={error} onRetry={reload} />
  const docs = [...(data ?? [])].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'PENDIENTE' ? -1 : 1))
  return (
    <div className="space-y-4">
      <h1 className="t-display text-[2.2rem] leading-none text-ink">Mis documentos</h1>
      {loading && !data ? <div className="h-24 animate-pulse rounded-3xl bg-slate-200" /> : docs.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line-strong bg-white p-4 text-lg text-ink-soft">No tienes documentos por ahora.</p>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => {
            const pendiente = d.estado === 'PENDIENTE'
            return (
              <li key={d.id}>
                <Link to={`/app/documentos/${d.id}`} className={cn('flex min-h-[88px] items-center gap-4 rounded-3xl border-2 p-4 active:scale-[0.98]', pendiente ? 'border-warn bg-warn-bg' : 'border-line-strong bg-white')}>
                  <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', pendiente ? 'bg-warn text-white' : 'bg-ok-bg text-ok')}>
                    {pendiente ? <FileSignature className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xl font-bold">{tituloDocumento(d)}</span>
                    <span className="block text-base text-ink-soft">{pendiente ? `Por firmar · enviado el ${formatFecha(d.creado_en)}` : `Firmado el ${formatFecha(d.fecha_firma)}`}</span>
                  </span>
                  <ChevronRight className="h-6 w-6 shrink-0 text-ink-soft" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
