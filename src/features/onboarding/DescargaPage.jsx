import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui'
import { InstalarShell } from './InstalarShell'
import { InstalarApp } from './InstalarApp'

/** Pantalla de descarga. Solo se llega aquí con la aceptación confirmada por Django (ver RequireInstalacion). */
export function DescargaPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <InstalarShell titulo="Instala la app de FYAG" subtitulo={`Listo, ${user?.first_name || user?.email}. Tu aceptación quedó registrada.`}>
      <InstalarApp />
      <Button variant="ghost" className="mt-4 w-full" onClick={() => logout()}>Cerrar sesión</Button>
    </InstalarShell>
  )
}
