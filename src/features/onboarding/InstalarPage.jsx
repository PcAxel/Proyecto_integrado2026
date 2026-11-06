import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { rutaPorEstado } from '@/domain/instalacion'
import { LoginFlow } from '@/features/auth/LoginFlow'
import { InstalarShell } from './InstalarShell'

const MarcoInstalar = ({ titulo, subtitulo, children }) => (
  <InstalarShell titulo={titulo} subtitulo={subtitulo.startsWith('Ingresa con tu correo') ? 'Ingresa con el correo y la contraseña temporal que te enviamos para instalar la aplicación.' : subtitulo}>
    {children}
  </InstalarShell>
)

/** Aterrizaje del link del correo de bienvenida: login real con 2FA y, según la aceptación en Django, términos o descarga. */
export function InstalarPage() {
  const navigate = useNavigate()
  const access = useAuthStore((s) => s.access)
  const user = useAuthStore((s) => s.user)
  if (access && user) return <Navigate to={rutaPorEstado({ access, user })} replace />

  return <LoginFlow Marco={MarcoInstalar} onListo={(u) => navigate(rutaPorEstado({ access: true, user: u }), { replace: true })} />
}
