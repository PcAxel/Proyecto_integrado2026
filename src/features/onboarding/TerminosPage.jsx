import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileCheck2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { RUTAS_INSTALAR } from '@/domain/instalacion'
import { Button } from '@/components/ui'
import { InstalarShell } from './InstalarShell'
import { TERMINOS, TERMINOS_VERSION } from './terminos'

/** Términos y condiciones: el checkbox es obligatorio y la descarga solo se habilita cuando Django confirma. */
export function TerminosPage() {
  const navigate = useNavigate()
  const aceptarTerminos = useAuthStore((s) => s.aceptarTerminos)
  const [acepto, setAcepto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const aceptar = async () => {
    setError(null)
    setCargando(true)
    try {
      await aceptarTerminos(TERMINOS_VERSION)
      navigate(RUTAS_INSTALAR.descarga, { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <InstalarShell
      ancho="max-w-2xl"
      titulo="Términos y condiciones de uso"
      subtitulo="Lee y acepta estos términos para poder instalar la aplicación de FYAG."
    >
      <div className="max-h-[45vh] space-y-4 overflow-y-auto rounded-lg border border-line bg-slate-50 p-4 text-sm leading-relaxed text-ink" tabIndex={0} aria-label="Texto de los términos y condiciones">
        {TERMINOS.map(([titulo, texto]) => (
          <section key={titulo}>
            <h2 className="font-semibold">{titulo}</h2>
            <p className="mt-1 text-ink-soft">{texto}</p>
          </section>
        ))}
        <p className="text-xs text-ink-faint">Versión {TERMINOS_VERSION}</p>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand,#0B6E99)]" />
        <span>He leído y acepto los términos y condiciones de uso de la aplicación corporativa de FYAG.</span>
      </label>

      {error && <p role="alert" className="mt-3 text-sm font-medium text-crit">{error}</p>}
      <Button size="lg" className="mt-5 w-full" disabled={!acepto} loading={cargando} onClick={aceptar} icon={FileCheck2}>
        Aceptar y continuar
      </Button>
    </InstalarShell>
  )
}
