import { Link, Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { can } from '@/domain/rbac'
import { inicioDeRolApi } from '@/domain/rolesApi'
import { EmptyState } from '@/components/ui'

/**
 * Guard de una pantalla por permiso (matriz RBAC). Complementa a RoleProtectedRoute: el servidor
 * igualmente rechaza (403) cualquier llamada que el rol no tenga permitida.
 * @param {{accion: string, children: import('react').ReactNode}} props
 */
export function RequireRole({ accion, children }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!can(user.rol, accion)) {
    return (
      <div className="card m-6">
        <EmptyState
          icon={ShieldAlert}
          title="Acceso restringido"
          hint="Tu rol no tiene permiso para esta sección."
          action={<Link to={inicioDeRolApi(user.rolApi)} className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">Ir a mi inicio</Link>}
        />
      </div>
    )
  }
  return children
}
