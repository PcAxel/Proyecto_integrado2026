import { cn } from './cn'

export const inputBase =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 hover:border-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:border-line disabled:bg-slate-50 disabled:text-ink-faint disabled:hover:border-line'

/**
 * Texto de una etiqueta con su marca de obligatoriedad: un asterisco rojo si el campo es obligatorio y «(Opcional)» si puede quedar vacío.
 * El asterisco es decorativo para el lector de pantalla, que oye «obligatorio».
 */
export function TextoEtiqueta({ texto, obligatorio, opcional }) {
  return (
    <>
      {texto}
      {obligatorio && <><span aria-hidden="true" className="ml-0.5 font-semibold text-crit">*</span><span className="sr-only"> (obligatorio)</span></>}
      {!obligatorio && opcional && <span className="ml-1.5 text-xs font-normal text-ink-faint">(Opcional)</span>}
    </>
  )
}

/** Envoltorio con etiqueta, ayuda y error. `obligatorio` agrega el asterisco rojo; `opcional`, «(Opcional)». */
export function Field({ label, hint, error, children, className, obligatorio, opcional }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink"><TextoEtiqueta texto={label} obligatorio={obligatorio} opcional={opcional} /></span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-crit">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>
      )}
    </label>
  )
}
