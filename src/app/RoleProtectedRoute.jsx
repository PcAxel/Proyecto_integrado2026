import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { inicioDeRolApi } from '@/domain/rolesApi'
import { RUTAS_INSTALAR } from '@/domain/instalacion'

/**
 * Guard por rol real (el que valida Django). Solo deja pasar a los roles de `allowedRoles`.
 * - sin sesión → /login;
 * - sin términos aceptados → pantalla de términos;
 * - rol no permitido → a su propia zona (un Técnico nunca ve /erp; el resto nunca ve /app).
 * @param {{allowedRoles: Array<'ADMIN'|'FINANZAS'|'OPERACIONES'|'TECNICO'>, children: import('react').ReactNode}} props
 */
export function RoleProtectedRoute({ allowedRoles, children }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user.terms_accepted_at) return <Navigate to={RUTAS_INSTALAR.terminos} replace />
  if (!allowedRoles.includes(user.rolApi)) return <Navigate to={inicioDeRolApi(user.rolApi)} replace />
  return children
}
