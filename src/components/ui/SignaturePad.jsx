import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from './Button'

/**
 * Firma digital táctil. Entrega un data URL PNG al terminar cada trazo (o null al limpiar).
 * @param {{value:string|null, onChange:(v:string|null)=>void}} props
 */
export function SignaturePad({ value, onChange }) {
  const ref = useRef(null)
  const dibujando = useRef(false)

  useEffect(() => {
    const c = ref.current
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const g = c.getContext('2d')
    g.scale(ratio, ratio)
    g.lineWidth = 2.5
    g.lineCap = 'round'
    g.strokeStyle = '#0F172A'
    if (value) {
      const img = new Image()
      img.onload = () => g.drawImage(img, 0, 0, c.clientWidth, c.clientHeight)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const punto = (e) => {
    const r = ref.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const inicio = (e) => {
    dibujando.current = true
    ref.current.setPointerCapture(e.pointerId)
    const g = ref.current.getContext('2d')
    g.beginPath()
    g.moveTo(...punto(e))
  }
  const mover = (e) => {
    if (!dibujando.current) return
    const g = ref.current.getContext('2d')
    g.lineTo(...punto(e))
    g.stroke()
  }
  const fin = () => {
    if (!dibujando.current) return
    dibujando.current = false
    onChange(ref.current.toDataURL('image/png'))
  }
  const limpiar = () => {
    const c = ref.current
    c.getContext('2d').clearRect(0, 0, c.clientWidth, c.clientHeight)
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-line bg-white">
        <canvas ref={ref} className="h-44 w-full touch-none" onPointerDown={inicio} onPointerMove={mover} onPointerUp={fin} onPointerLeave={fin} aria-label="Área de firma" />
        {!value && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint">Firme aquí</span>}
      </div>
      <Button type="button" variant="ghost" size="md" icon={Eraser} className="mt-2" onClick={limpiar}>Borrar firma</Button>
    </div>
  )
}
