import { cn } from '@/components/ui'
import { iniciales } from '@/domain/usuarios'

// Cada rol tiene su tono, así se distingue de un vistazo quién es quién (listas, menú, selector).
const POR_ROL = {
  ADMIN_GENERAL: 'from-[#F0A030] to-[#D9822B] text-deep',
  ADMINISTRACION: 'from-[#0C7C99] to-[#3DB4D2] text-white',
  BODEGA: 'from-[#1F8A70] to-[#4FBFA3] text-white',
  SUPERVISOR: 'from-[#3E6A9E] to-[#7BA0D4] text-white',
  TECNICO: 'from-[#5B6B7A] to-[#93A3B2] text-white',
  CONSULTA: 'from-[#6B7F8C] to-[#A9B8C3] text-white',
  RRHH: 'from-[#8B6BB1] to-[#B79CD6] text-white',
}
const TAMANOS = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-14 w-14 text-base' }

/** Círculo con las iniciales, teñido según el rol. */
export function Avatar({ nombre, rol, size = 'md', className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('t-display inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-2 ring-white/70', POR_ROL[rol] ?? POR_ROL.CONSULTA, TAMANOS[size], className)}
    >
      {iniciales(nombre)}
    </span>
  )
}
