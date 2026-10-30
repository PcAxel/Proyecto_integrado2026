import { useEffect, useState } from 'react'
import { cn } from '@/components/ui'

const R = 78
const C = 100
const BARRIDO = 240 // grados del arco (de −120° a +120°)

const polar = (grados, r) => [C + r * Math.sin((grados * Math.PI) / 180), C - r * Math.cos((grados * Math.PI) / 180)]
const arco = (g1, g2, r) => {
  const [x1, y1] = polar(g1, r)
  const [x2, y2] = polar(g2, r)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${g2 - g1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const TEMAS = {
  oscuro: { marca: 'rgba(255,255,255,.38)', mayor: 'rgba(255,255,255,.75)', texto: '#fff', sub: 'rgba(255,255,255,.62)', aguja: '#7DE3F4', pista: 'rgba(255,255,255,.10)', ok: '#46C98F', warn: '#F0A030', crit: '#EF6A5F' },
  claro: { marca: '#C3D0D9', mayor: '#617684', texto: '#12222F', sub: '#51636F', aguja: '#0B2A3C', pista: '#EBF1F5', ok: '#1B8A58', warn: '#E09323', crit: '#C73A30' },
}

/**
 * Manómetro: un dial de escala con bandas de color y aguja. Es el instrumento de la interfaz:
 * lee el margen de un presupuesto, la salud del stock o los documentos al día.
 * La aguja barre desde el mínimo una sola vez al aparecer (se omite con «reducir movimiento»).
 *
 * @param {{valor:number, max?:number, bandas?: Array<{hasta:number, tono:'ok'|'warn'|'crit'}>, texto:string, etiqueta?: string,
 *   marcas?: number, tema?: 'oscuro'|'claro', className?: string, animar?: boolean}} props
 */
export function Manometro({ valor, max = 50, bandas = [], texto, etiqueta, marcas = 10, tema = 'oscuro', className, animar = true }) {
  const t = TEMAS[tema]
  const objetivo = -BARRIDO / 2 + (Math.min(Math.max(valor, 0), max) / max) * BARRIDO
  const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [angulo, setAngulo] = useState(animar && !reducir ? -BARRIDO / 2 : objetivo)

  useEffect(() => {
    if (!animar || reducir) { setAngulo(objetivo); return undefined }
    const id = requestAnimationFrame(() => setAngulo(objetivo)) // el cambio de ángulo dispara la transición CSS
    return () => cancelAnimationFrame(id)
  }, [objetivo, animar, reducir])

  const aGrados = (v) => -BARRIDO / 2 + (v / max) * BARRIDO
  const desde = [0, ...bandas.slice(0, -1).map((b) => b.hasta)]
  const mayores = Array.from({ length: Math.floor(max / marcas) + 1 }, (_, i) => i * marcas)
  const menores = Array.from({ length: max + 1 }, (_, i) => i).filter((v) => v % (marcas / 2) === 0 && v % marcas !== 0)

  return (
    <svg viewBox="0 0 200 176" className={cn('block w-full', className)} role="img" aria-label={`${etiqueta ? `${etiqueta}: ` : ''}${texto}`}>
      <path d={arco(-BARRIDO / 2, BARRIDO / 2, R)} fill="none" stroke={t.pista} strokeWidth="7" strokeLinecap="round" />
      {bandas.map((b, i) => (
        <path key={b.hasta} d={arco(aGrados(desde[i]) + (i === 0 ? 0 : 0.8), aGrados(b.hasta) - (i === bandas.length - 1 ? 0 : 0.8), R)} fill="none" stroke={t[b.tono]} strokeWidth="7" strokeLinecap="butt" opacity={tema === 'oscuro' ? 0.95 : 1} />
      ))}
      {menores.map((v) => {
        const [x1, y1] = polar(aGrados(v), R - 8)
        const [x2, y2] = polar(aGrados(v), R - 13)
        return <line key={`m${v}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.marca} strokeWidth="1" />
      })}
      {mayores.map((v) => {
        const [x1, y1] = polar(aGrados(v), R - 8)
        const [x2, y2] = polar(aGrados(v), R - 17)
        const [lx, ly] = polar(aGrados(v), R - 27)
        return (
          <g key={`M${v}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.mayor} strokeWidth="1.6" />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize="8.5" fill={t.sub} fontFamily="JetBrains Mono, monospace">{v}</text>
          </g>
        )
      })}
      <g style={{ transform: `rotate(${angulo}deg)`, transformOrigin: `${C}px ${C}px`, transition: animar && !reducir ? 'transform 1.4s cubic-bezier(0.18, 0.9, 0.22, 1)' : 'none' }}>
        <line x1={C} y1={C + 14} x2={C} y2={C - R + 14} stroke={t.aguja} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx={C} cy={C} r="7.5" fill={t.aguja} />
        <circle cx={C} cy={C} r="2.8" fill={tema === 'oscuro' ? '#0B2A3C' : '#fff'} />
      </g>
      <text x={C} y="150" textAnchor="middle" fontSize="27" fontWeight="600" fill={t.texto} fontFamily="Barlow Semi Condensed, sans-serif" letterSpacing="-0.3">{texto}</text>
      {etiqueta && <text x={C} y="167" textAnchor="middle" fontSize="10" fill={t.sub} fontFamily="IBM Plex Sans, sans-serif">{etiqueta}</text>}
    </svg>
  )
}
