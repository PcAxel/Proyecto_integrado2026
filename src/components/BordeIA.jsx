import { useAsistenteStore } from '@/stores/asistenteStore'

/**
 * Resplandor azul y blanco en el borde de la pantalla mientras el asistente trabaja (pensando, o llevándote a un lugar).
 * No bloquea clics (`pointer-events-none`), aparece y se desvanece suave y, con «reducir movimiento», no pulsa.
 */
export function BordeIA() {
  const trabajando = useAsistenteStore((s) => s.trabajando)
  return (
    <div aria-hidden="true" data-no-leer className={`borde-ia pointer-events-none fixed inset-0 z-[80] transition-opacity duration-500 ${trabajando ? 'opacity-100' : 'opacity-0'}`} />
  )
}
