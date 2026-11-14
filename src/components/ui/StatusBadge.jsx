import { useAccessibility } from '@/context/AccessibilityContext'
import { ICONO_ESTADO, etiquetaAccesible, normalizarTipoEstado } from '@/domain/estados'
import { cn } from './cn'

// Clases COMPLETAS y literales: Tailwind solo genera las que encuentra escritas tal cual (no sirve armarlas con variables).
// `[html:not(.tema-claro)_&]:` = tema oscuro del ERP (`tema-claro` marca el modo día): ahí los colores salen de la paleta del tema, porque los fondos
// claros de Tailwind encandilarían sobre un fondo oscuro.
const BASE = {
  critical: 'bg-red-100 text-red-800 [html:not(.tema-claro)_&]:bg-crit-bg [html:not(.tema-claro)_&]:text-crit',
  success: 'bg-green-100 text-green-800 [html:not(.tema-claro)_&]:bg-ok-bg [html:not(.tema-claro)_&]:text-ok',
  warning: 'bg-amber-100 text-amber-800 [html:not(.tema-claro)_&]:bg-warn-bg [html:not(.tema-claro)_&]:text-warn',
  info: 'bg-sky-100 text-sky-800 [html:not(.tema-claro)_&]:bg-brand-tint [html:not(.tema-claro)_&]:text-brand-light',
  neutral: 'bg-slate-100 text-slate-700',
}
const BORDE_NORMAL = 'border-transparent'
// Modo daltonismo: borde más oscuro y de forma propia (sólido en crítico, de guiones en advertencia, punteado en neutral).
const BORDE_DALTONISMO = {
  critical: 'border-solid border-red-600 [html:not(.tema-claro)_&]:border-crit',
  success: 'border-solid border-green-600 [html:not(.tema-claro)_&]:border-ok',
  warning: 'border-dashed border-amber-600 [html:not(.tema-claro)_&]:border-warn',
  info: 'border-solid border-sky-600 [html:not(.tema-claro)_&]:border-brand-light',
  neutral: 'border-dotted border-slate-500',
}

/**
 * Etiqueta de estado unificada (Cardex, Presupuestos, stock…). Regla «nunca solo color»:
 * - Normal: fondo y texto de color (rojo, verde, ámbar, celeste o gris) más el texto del estado.
 * - Modo Daltonismo (se activa en «Opciones de Inclusión»): suma un ícono (⚠️ crítico y advertencia, ✅ correcto) y un borde más oscuro con forma propia.
 * - Siempre: `aria-label` con el tipo y el texto, para lectores de pantalla.
 * @param {{type?: 'critical'|'success'|'warning'|'info'|'neutral', label: string, className?: string}} props
 */
export function StatusBadge({ type = 'neutral', label, className }) {
  const { colorBlindMode } = useAccessibility()
  const tipo = normalizarTipoEstado(type)
  const icono = colorBlindMode ? ICONO_ESTADO[tipo] : null
  return (
    // role="img" + aria-label: el lector anuncia «Estado crítico: Stock Crítico» una sola vez, con o sin el modo visual activo.
    <span
      role="img" aria-label={etiquetaAccesible(tipo, label)} data-tipo={tipo}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 px-2 py-0.5 text-xs font-medium', BASE[tipo], colorBlindMode ? BORDE_DALTONISMO[tipo] : BORDE_NORMAL, className)}
    >
      {icono && <span aria-hidden="true" className="text-[0.95em] leading-none">{icono}</span>}
      <span aria-hidden="true">{label}</span>
    </span>
  )
}
