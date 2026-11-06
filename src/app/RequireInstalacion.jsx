import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { redireccionRequerida } from '@/domain/instalacion'
import { InstalarShell } from '@/features/onboarding/InstalarShell'
import { Skeleton } from '@/components/ui'

/**
 * Guard del flujo de instalación. Antes de decidir, confirma con Django el estado real
 * (`/api/auth/me/`); mientras tanto no muestra contenido protegido.
 * @param {{nivel: 'sesion'|'terminos', children: import('react').ReactNode}} props
 */
export function RequireInstalacion({ nivel, children }) {
  const access = useAuthStore((s) => s.access)
  const user = useAuthStore((s) => s.user)
  const sincronizar = useAuthStore((s) => s.sincronizar)
  const [verificado, setVerificado] = useState(!access)
  const [errorRed, setErrorRed] = useState(null)

  useEffect(() => {
    if (!access) return undefined
    let vivo = true
    sincronizar()
      .catch((e) => vivo && e.status !== 401 && setErrorRed(e.message))
      .finally(() => vivo && setVerificado(true))
    return () => { vivo = false }
    // Solo al entrar a la ruta: cada navegación del flujo vuelve a consultar al backend.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!verificado) return <InstalarShell titulo="Verificando tu acceso…"><Skeleton rows={3} /></InstalarShell>
  if (errorRed && nivel === 'terminos') {
    return <InstalarShell titulo="No pudimos verificar tu acceso"><p className="text-sm text-crit">{errorRed}</p></InstalarShell>
  }
  const destino = redireccionRequerida({ access, user }, nivel)
  return destino ? <Navigate to={destino} replace /> : children
}
