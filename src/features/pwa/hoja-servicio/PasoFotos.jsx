import { useRef, useState } from 'react'
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, IconButton } from '@/components/ui'
import { GpsStamp } from '@/components/domain'
import { dentroDeGeocerca } from '@/domain/geo'
import { isoLocal } from '@/domain/format'
import { FOTOS_MIN } from '@/domain/hojas'
import { obtenerPosicion } from '@/lib/gps'
import { reducirImagen, fotoDeEjemplo } from '@/lib/imagen'
import { useSyncStore } from '@/stores/syncStore'

export function PasoFotos({ obra, draft, setDraft }) {
  const gpsModo = useSyncStore((s) => s.gpsModo)
  const [capturando, setCapturando] = useState(false)
  const inputs = { Antes: useRef(null), Después: useRef(null) }

  const agregar = async (etiqueta, file) => {
    setCapturando(true)
    try {
      const pos = await obtenerPosicion(obra.ubicacion, gpsModo)
      const thumb = file ? await reducirImagen(file) : fotoDeEjemplo(etiqueta)
      const foto = { id: `F-${Date.now()}`, etiqueta, lat: pos.lat, lng: pos.lng, simulado: pos.simulado, ts: isoLocal(), thumb }
      setDraft({ ...draft, fotos: [...draft.fotos, foto] })
      const g = dentroDeGeocerca(pos, obra.ubicacion, obra.ubicacion.radio_m)
      if (!g.dentro) toast.warning(`Foto fuera de la geocerca (${g.distanciaM} m). Quedará marcada en la auditoría.`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCapturando(false)
    }
  }
  const onFile = (etiqueta) => (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) agregar(etiqueta, f)
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-ink-soft">Toma al menos {FOTOS_MIN} fotos: una <b>antes</b> y una <b>después</b>. Cada foto lleva sello GPS.</p>
      <div className="grid grid-cols-2 gap-3">
        {['Antes', 'Después'].map((et) => (
          <div key={et}>
            <input ref={inputs[et]} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile(et)} />
            <Button type="button" size="lg" className="w-full" icon={capturando ? Loader2 : Camera} disabled={capturando} onClick={() => inputs[et].current.click()}>{et}</Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" icon={ImagePlus} className="w-full" disabled={capturando} onClick={() => agregar(draft.fotos.length % 2 === 0 ? 'Antes' : 'Después')}>
        Agregar foto de ejemplo (demo)
      </Button>

      <div className="grid grid-cols-2 gap-3">
        {draft.fotos.map((f) => {
          const g = dentroDeGeocerca(f, obra.ubicacion, obra.ubicacion.radio_m)
          return (
            <figure key={f.id} className="card overflow-hidden">
              <div className="relative">
                <img src={f.thumb} alt={`Foto ${f.etiqueta}`} className="aspect-[4/3] w-full object-cover" />
                <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-sm font-medium text-white">{f.etiqueta}</span>
                <IconButton icon={X} label="Quitar foto" size="sm" className="absolute right-1 top-1 bg-white/90" onClick={() => setDraft({ ...draft, fotos: draft.fotos.filter((x) => x.id !== f.id) })} />
              </div>
              <figcaption className="p-2"><GpsStamp lat={f.lat} lng={f.lng} geocerca={g} simulado={f.simulado} className="flex-wrap" /></figcaption>
            </figure>
          )
        })}
      </div>
      <p className="text-center text-sm text-ink-faint">{draft.fotos.length} de {FOTOS_MIN} fotos mínimas</p>
    </div>
  )
}
