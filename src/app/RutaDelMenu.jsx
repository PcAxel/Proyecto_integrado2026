import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { itemDeRuta, itemVisible } from '@/layouts/nav'

/**
 * Guardia de rutas del ERP: una pantalla que el menú le oculta a este rol tampoco se abre escribiendo la dirección (vuelve al inicio).
 * Usa la misma regla que el menú (`itemVisible`), así lo que se ve y lo que se puede abrir nunca se contradicen. El servidor valida igual cada dato.
 */
export function RutaDelMenu({ children }) {
  const rol = useAuthStore((s) => s.user?.rol)
  const { pathname } = useLocation()
  const item = itemDeRuta(pathname)
  if (item && !itemVisible(item, rol)) return <Navigate to="/erp" replace />
  return children
}
