import { AlertTriangle } from 'lucide-react'
import { cn } from '@/components/ui'

/**
 * Interruptor CU30: abrir la obra sin presupuesto previo (solo Emergencia o Garantía).
 * @param {{checked:boolean, onChange:(v:boolean)=>void, permitido:boolean}} props
 */
export function ToggleEmergencia({ checked, onChange, permitido }) {
  return (
    <div className={cn('rounded-lg border p-4', checked ? 'border-warn/40 bg-warn-bg' : 'border-line bg-surface')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className={cn('h-4 w-4', checked ? 'text-warn' : 'text-ink-faint')} />Abrir sin presupuesto previo (CU30)</p>
          <p className="mt-1 text-xs text-ink-soft">
            {permitido
              ? 'La obra quedará marcada como emergencia sin presupuesto y deberá regularizarse antes de finalizar.'
              : 'Solo un Supervisor o Gerencia puede abrir obras sin presupuesto.'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={checked} aria-label="Abrir sin presupuesto (CU30)" disabled={!permitido} onClick={() => onChange(!checked)}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-warn' : 'bg-slate-300')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
    </div>
  )
}
