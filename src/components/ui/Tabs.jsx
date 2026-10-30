import { cn } from './cn'

/** @param {{tabs: Array<{id:string,label:string,count?:number}>, value:string, onChange:(id:string)=>void}} props */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line-strong/70">
      {tabs.map((t) => {
        const activa = value === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-4 py-3 text-sm font-medium transition-colors duration-150',
              activa ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:border-slate-300 hover:text-ink',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-none', activa ? 'bg-brand text-white' : 'bg-slate-100 text-ink-soft')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
