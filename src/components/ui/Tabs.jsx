import { cn } from './cn'

/** @param {{tabs: Array<{id:string,label:string,count?:number}>, value:string, onChange:(id:string)=>void}} props */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            value === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
