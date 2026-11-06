import { useEffect, useRef, useState } from 'react'
import { Camera, Keyboard } from 'lucide-react'
import jsQR from 'jsqr'
import { Input } from '@/components/ui'

/**
 * Lector de QR con la cámara del equipo, más un campo para lectores USB tipo teclado o para escribir el SKU.
 * La cámara solo funciona con HTTPS (o localhost) y con permiso del usuario; si se niega, queda el campo de texto.
 * Se apaga sola al desmontarse. `onCodigo` se llama una vez por lectura (el mismo código no se repite en 2 s).
 * @param {{onCodigo:(texto:string)=>void, continuo?:boolean}} props
 */
export function EscanerQr({ onCodigo }) {
  const video = useRef(null)
  const lienzo = useRef(null)
  const ultimo = useRef({ texto: '', t: 0 })
  const alLeer = useRef(onCodigo)
  alLeer.current = onCodigo
  const [estado, setEstado] = useState('iniciando') // iniciando | activa | error
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let vivo = true
    let stream = null
    let raf = 0

    const ciclo = () => {
      const v = video.current
      if (!vivo || !v) return
      if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
        const escala = Math.min(1, 640 / v.videoWidth)
        const w = Math.round(v.videoWidth * escala)
        const h = Math.round(v.videoHeight * escala)
        const c = lienzo.current
        c.width = w
        c.height = h
        const g = c.getContext('2d', { willReadFrequently: true })
        g.drawImage(v, 0, 0, w, h)
        const lectura = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
        const ahora = Date.now()
        if (lectura?.data && (lectura.data !== ultimo.current.texto || ahora - ultimo.current.t > 2000)) {
          ultimo.current = { texto: lectura.data, t: ahora }
          alLeer.current(lectura.data)
        }
      }
      raf = requestAnimationFrame(() => setTimeout(ciclo, 90))
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('error'); setError('Este navegador no permite usar la cámara aquí (se necesita HTTPS). Usa el campo de texto.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        setEstado('activa')
        ciclo()
      } catch (e) {
        setEstado('error')
        setError(e?.name === 'NotAllowedError' ? 'Permite el acceso a la cámara para escanear, o usa el campo de texto.' : 'No se pudo abrir la cámara. Usa el campo de texto.')
      }
    })()

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop()) // apaga la cámara
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-deep">
        <video ref={video} playsInline muted className="h-full w-full object-cover" aria-label="Vista de la cámara" />
        <canvas ref={lienzo} className="hidden" />
        {estado === 'activa' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-[55%] w-[55%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(11,42,60,0.45)]" />
          </div>
        )}
        {estado !== 'activa' && (
          <p role={estado === 'error' ? 'alert' : 'status'} className="absolute inset-0 flex items-center justify-center gap-2 p-6 text-center text-sm text-white">
            <Camera className="h-5 w-5 shrink-0" />{estado === 'error' ? error : 'Abriendo la cámara…'}
          </p>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { alLeer.current(manual); setManual('') } }}>
        <Input label="Lector USB o escribir el SKU" placeholder="Ej.: REF-404A y Enter" icon={Keyboard} value={manual} autoComplete="off"
          onChange={(e) => setManual(e.target.value)} />
      </form>
    </div>
  )
}
