import { useId } from 'react'

/**
 * Marca de FYAG: un cristal de hielo hexagonal cuyo brazo superior termina en una hoja.
 * Frío (el cristal) y agroindustria (la hoja) en un solo trazo.
 */
export function BrandMark({ size = 36, className }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} role="img" aria-label="FYAG">
      <defs>
        <linearGradient id={`${id}-g`} x1="6" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3DB4D2" />
          <stop offset="1" stopColor="#0C7C99" />
        </linearGradient>
      </defs>
      <path d="M20 2.5 35 11.25v17.5L20 37.5 5 28.75v-17.5z" fill={`url(#${id}-g)`} />
      <path d="M20 2.5 35 11.25v17.5L20 37.5 5 28.75v-17.5z" fill="none" stroke="#fff" strokeOpacity=".28" />
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M20 10.5v19M11.8 15.2l16.4 9.6M11.8 24.8l16.4-9.6" />
        <path d="M17.6 12.6 20 14.6l2.4-2M17.6 27.4 20 25.4l2.4 2" strokeWidth="1.5" />
      </g>
      <path d="M28.2 15.2c3.6-.2 5.4-2.4 5.8-5.6-3.4-.1-5.7 1.7-5.8 5.6z" fill="#F0A030" />
    </svg>
  )
}
