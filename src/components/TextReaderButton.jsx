import { Pause, Play, Square, Volume2 } from 'lucide-react'
import { cn } from '@/components/ui'
import { useSpeech } from '@/hooks/useSpeech'

/**
 * Botón pequeño que lee un texto en voz alta con la voz del dispositivo. Mientras lee cambia a «detener» (cuadrado) y se tiñe de color de marca,
 * con un pulso suave. No se muestra en navegadores sin síntesis de voz.
 * @param {{text: string, label?: string, pausable?: boolean, size?: 'sm'|'md', className?: string}} props
 *  `label`: de qué trata el texto (para lectores de pantalla), p. ej. «el resumen del dashboard».
 */
export function TextReaderButton({ text, label = 'este texto', pausable = false, size = 'sm', className }) {
  const { soportado, hablando, pausado, iniciar, pausar, reanudar, detener } = useSpeech()
  if (!soportado || !String(text ?? '').trim()) return null
  const activo = hablando || pausado
  const caja = size === 'md' ? 'h-9 w-9' : 'h-7 w-7'
  const icono = size === 'md' ? 'h-[18px] w-[18px]' : 'h-4 w-4'
  const base = cn('relative inline-flex shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40', caja)

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button" onClick={() => (activo ? detener() : iniciar(text))} aria-pressed={activo}
        aria-label={activo ? `Detener la lectura de ${label}` : `Leer en voz alta ${label}`} title={activo ? 'Detener lectura' : 'Leer en voz alta'}
        className={cn(base, activo ? 'border-brand bg-brand text-white hover:bg-brand-dark' : 'border-line-strong bg-transparent text-ink-soft hover:border-brand hover:text-brand')}
      >
        {hablando && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 motion-reduce:hidden" aria-hidden="true" />}
        {activo ? <Square className={cn(icono, 'relative fill-current')} aria-hidden="true" /> : <Volume2 className={icono} aria-hidden="true" />}
      </button>
      {pausable && activo && (
        <button type="button" onClick={pausado ? reanudar : pausar} aria-label={pausado ? 'Continuar la lectura' : 'Pausar la lectura'} title={pausado ? 'Continuar' : 'Pausar'}
          className={cn(base, 'border-line-strong text-ink-soft hover:border-brand hover:text-brand')}>
          {pausado ? <Play className={icono} aria-hidden="true" /> : <Pause className={icono} aria-hidden="true" />}
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">{hablando ? 'Leyendo en voz alta' : pausado ? 'Lectura en pausa' : ''}</span>
    </span>
  )
}
