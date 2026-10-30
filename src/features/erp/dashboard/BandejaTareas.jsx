import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { Card, EmptyState, cn } from '@/components/ui'

const MARCA = { CRITICA: 'bg-crit', ADVERTENCIA: 'bg-harvest', INFO: 'bg-brand' }
const ETIQUETA = { CRITICA: 'Urgente', ADVERTENCIA: 'Atención', INFO: 'Pendiente' }

/** «Pendientes para ti»: tareas que este rol puede resolver ahora, ordenadas por gravedad. Cada fila lleva a donde se resuelve. */
export function BandejaTareas({ tareas }) {
  return (
    <Card title="Pendientes para ti" subtitle={tareas.length ? `${tareas.length} por resolver` : 'Nada por resolver'} icon={CheckCircle2} padded={false}>
      {tareas.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Estás al día" hint="Cuando algo requiera tu acción, aparecerá aquí con un acceso directo." />
      ) : (
        <ul>
          {tareas.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <Link to={t.ruta} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand-tint/45">
                <span className={cn('h-10 w-1 shrink-0 rounded-full', MARCA[t.severidad])} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{t.titulo}</span>
                    {t.severidad !== 'INFO' && (
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold', t.severidad === 'CRITICA' ? 'bg-crit-bg text-crit' : 'bg-warn-bg text-warn')}>{ETIQUETA[t.severidad]}</span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-ink-soft">{t.detalle}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-brand-dark sm:flex">
                  {t.cta}
                  <ChevronRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
