import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Copy, Download, Share, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { detectarPlataforma, estaInstalada, modoInstalacion } from '@/domain/plataforma'
import { lanzarInstalacion, usePwaInstall } from '@/lib/pwaInstall'
import { Button, botonClases } from '@/components/ui'
import { GuiaIOS } from './GuiaIOS'

const leerPlataforma = () => detectarPlataforma(globalThis.navigator ?? {})
const leerInstalada = () => estaInstalada({
  displayStandalone: globalThis.matchMedia?.('(display-mode: standalone)').matches,
  navigatorStandalone: globalThis.navigator?.standalone,
})

/** Módulo de instalación: elige la experiencia según el dispositivo (Android/Chrome, iOS/Safari u otro). */
export function InstalarApp() {
  const { promptDisponible, instaladaEnSesion } = usePwaInstall()
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const plataforma = leerPlataforma()
  const modo = modoInstalacion({ plataforma, instalada: leerInstalada() || instaladaEnSesion, promptDisponible })

  const instalar = async () => {
    setInstalando(true)
    try {
      if ((await lanzarInstalacion()) === 'dismissed') toast('Puedes instalarla cuando quieras desde esta pantalla.')
    } finally {
      setInstalando(false)
    }
  }
  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(location.href); toast.success('Link copiado. Pégalo en Safari.') } catch { toast.error('No se pudo copiar el link.') }
  }

  return (
    <div className="space-y-4">
      {modo === 'instalada' && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-ok"><CheckCircle2 className="h-5 w-5" />La aplicación ya está instalada en este dispositivo.</p>
          <Link to="/app" className={`${botonClases('primary', 'lg')} w-full`}>Abrir la aplicación</Link>
        </>
      )}

      {modo === 'prompt' && (
        <Button size="lg" className="h-16 w-full text-lg" onClick={instalar} loading={instalando} icon={Download}>
          Descargar e Instalar App FYAG
        </Button>
      )}

      {modo === 'guia-ios' && (
        <>
          <Button size="lg" className="h-16 w-full text-lg" onClick={() => setGuiaAbierta(true)} icon={Share}>
            Instalar App FYAG en mi {plataforma.ipad ? 'iPad' : 'iPhone'}
          </Button>
          <p className="text-center text-sm text-ink-soft">Apple no permite instalar con un solo toque: te mostramos cómo en 3 pasos.</p>
          <GuiaIOS open={guiaAbierta} onClose={() => setGuiaAbierta(false)} ipad={plataforma.ipad} />
        </>
      )}

      {modo === 'abrir-en-safari' && (
        <div className="rounded-lg bg-harvest-bg p-4 text-sm text-ink">
          <p className="font-semibold">Para instalar en iPhone o iPad, abre este link en Safari.</p>
          <p className="mt-1 text-ink-soft">Este navegador no puede agregar la app a tu pantalla de inicio.</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={copiarLink} icon={Copy}>Copiar link</Button>
        </div>
      )}

      {modo === 'manual' && (
        <p className="flex items-start gap-2 rounded-lg bg-brand-tint/60 p-4 text-sm text-ink">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          Abre este link en Chrome desde tu teléfono y usa el menú ⋮ → «Instalar aplicación». Si no aparece, recarga la página.
        </p>
      )}
    </div>
  )
}
