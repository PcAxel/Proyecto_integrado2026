import { cn } from './cn'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

/**
 * Tabla adaptable: tabla clásica desde `sm`; en teléfono cada fila es una tarjeta
 * (primera columna como título, el resto como pares etiqueta/valor y las acciones al pie).
 * @param {{
 *  columns: Array<{key:string, header:string, render?:(row:any)=>import('react').ReactNode, align?:'left'|'right', mono?:boolean, className?:string}>,
 *  rows: any[], rowKey: (row:any)=>string, loading?: boolean,
 *  onRowClick?: (row:any)=>void, emptyTitle?: string, emptyHint?: string
 * }} props
 */
export function DataTable({ columns, rows, rowKey, loading, onRowClick, emptyTitle = 'Sin registros', emptyHint }) {
  if (loading) return <Skeleton rows={6} />
  if (!rows.length) return <EmptyState title={emptyTitle} hint={emptyHint} />

  const celda = (c, row) => (c.render ? c.render(row) : row[c.key])
  const [titulo, ...detalle] = columns.filter((c) => c.header)
  const acciones = columns.filter((c) => !c.header)

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong/60 bg-slate-50/80 text-left text-[12px] font-semibold text-ink-soft">
              {columns.map((c) => (
                <th key={c.key} className={cn('whitespace-nowrap px-4 py-3 font-semibold', c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-line last:border-0 transition-colors duration-100', onRowClick ? 'cursor-pointer hover:bg-brand-tint/45' : 'hover:bg-slate-50/70')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3.5', c.align === 'right' && 'text-right', c.mono && 'whitespace-nowrap font-mono text-[13px] tabular-nums text-ink/90', c.className)}>
                    {celda(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line sm:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('min-w-0 px-4 py-3', onRowClick && 'cursor-pointer active:bg-slate-50')}
          >
            <div className={cn('min-w-0 break-words font-medium', titulo.mono && 'font-mono')}>{celda(titulo, row)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {detalle.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-xs text-ink-soft">{c.header}</dt>
                  <dd className={cn('min-w-0 break-words', c.mono && 'font-mono tabular-nums')}>{celda(c, row)}</dd>
                </div>
              ))}
            </dl>
            {acciones.length > 0 && (
              <div className="mt-2 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {acciones.map((c) => <span key={c.key}>{celda(c, row)}</span>)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
