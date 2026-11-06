import { useRef, useState } from 'react'
import { Camera, CheckCircle2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Select, Textarea } from '@/components/ui'
import { ErrorEstado } from '@/components/ErrorEstado'
import { obrasService, evidenciasService } from '@/services'
import { useResource } from '@/hooks/useResource'
import { formatFechaHora } from '@/domain/format'

/** Posición real del dispositivo; sin permiso o sin GPS no se puede enviar la evidencia. */
function posicion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no tiene GPS.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      () => reject(new Error('Activa la ubicación (GPS) para enviar la evidencia.')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  })
}

const dispositivo = () => ({
  modelo: navigator.userAgentData?.platform ?? navigator.platform ?? '',
  so: navigator.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).join(', ') ?? navigator.userAgent.slice(0, 90),
})

/** Sube la foto del trabajo a Django (que la guarda en MongoDB) con GPS y metadatos del equipo. */
export function EvidenciaPage() {
  const obras = useResource(() => obrasService.list(), [])
  const reportes = useResource(() => evidenciasService.reportes(), [])
  const archivo = useRef(null)
  const [obra, setObra] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const enviar = async (e) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const pos = await posicion()
      const d = dispositivo()
      const form = new FormData()
      form.append('foto', foto)
      form.append('obra', obra)
      form.append('descripcion', descripcion)
      form.append('latitud', pos.latitude)
      form.append('longitud', pos.longitude)
      form.append('precision_gps_m', pos.accuracy)
      form.append('capturada_en', new Date(foto.lastModified || Date.now()).toISOString())
      form.append('dispositivo_modelo', d.modelo)
      form.append('dispositivo_so', d.so)
      form.append('app_version', '0.1.0')
      await evidenciasService.subir(form)
      toast.success('Evidencia enviada')
      setFoto(null); setDescripcion('')
      if (archivo.current) archivo.current.value = ''
      reportes.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const abiertas = (obras.data ?? []).filter((o) => o.estado !== 'FINALIZADA')

  return (
    <div className="space-y-6">
      <form onSubmit={enviar} className="space-y-4">
        {obras.error ? <ErrorEstado error={obras.error} onReintentar={obras.reload} /> : (
          <Select label="Obra" required size="lg" value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Elige la obra"
            options={abiertas.map((o) => ({ value: o.id, label: `${o.id} · ${o.nombre}` }))} />
        )}
        <div>
          <input ref={archivo} id="foto" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <label htmlFor="foto" className="flex h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand bg-white text-lg font-bold text-brand active:bg-brand-tint">
            <Camera className="h-8 w-8" />{foto ? foto.name : 'Tomar o elegir foto'}
          </label>
        </div>
        <Textarea label="Qué se hizo" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={1000} />
        <p className="flex items-center gap-2 text-sm text-ink-soft"><MapPin className="h-4 w-4" />Se enviará tu ubicación actual y los datos de tu equipo.</p>
        {error && <p role="alert" className="text-base font-semibold text-crit">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={enviando} disabled={!obra || !foto}>Enviar evidencia</Button>
      </form>

      <section aria-label="Mis evidencias">
        <h2 className="mb-2 text-lg font-bold text-ink">Mis evidencias</h2>
        {reportes.error ? <ErrorEstado error={reportes.error} onReintentar={reportes.reload} /> : (
          <ul className="space-y-2">
            {(reportes.data ?? []).map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-card">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                <div className="min-w-0 text-sm"><p className="font-medium">{r.descripcion || 'Sin descripción'}</p><p className="text-ink-soft">{formatFechaHora(r.created_at)}</p></div>
              </li>
            ))}
            {reportes.data?.length === 0 && <li className="rounded-2xl bg-white p-4 text-ink-soft">Aún no has enviado evidencias.</li>}
          </ul>
        )}
      </section>
    </div>
  )
}
