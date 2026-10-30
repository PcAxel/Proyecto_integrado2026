/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutros con un matiz petróleo: todo el gris del sistema comparte la misma temperatura de color.
        slate: { 50: '#F6F9FB', 100: '#EBF1F5', 200: '#DDE5EB', 300: '#C3D0D9', 400: '#8FA2AF', 500: '#617684', 600: '#475C6B', 700: '#34485A', 800: '#1F3344', 900: '#12222F' },
        canvas: '#EEF3F6',
        surface: '#FFFFFF',
        line: { DEFAULT: '#DDE5EB', strong: '#C3D0D9' },
        ink: { DEFAULT: '#12222F', soft: '#51636F', faint: '#7D909D' },
        // Glaciar: la acción principal. Petróleo: la identidad (barra lateral y paneles de instrumentos).
        brand: { DEFAULT: '#0C7C99', dark: '#096681', light: '#3DB4D2', tint: '#E6F5F9' },
        deep: { DEFAULT: '#0B2A3C', 800: '#0F3650', 700: '#164563', 600: '#1F5878' },
        ice: '#7DE3F4',
        // Durazno de cosecha: el único acento cálido, reservado para lo que pide atención.
        harvest: { DEFAULT: '#F0A030', bg: '#FDF0D5' },
        ok: { DEFAULT: '#1B8A58', bg: '#E1F4EA' },
        warn: { DEFAULT: '#B86E00', bg: '#FDF0D5' },
        crit: { DEFAULT: '#C73A30', bg: '#FCE6E3' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        // Placa de equipo: titulares y cifras grandes.
        display: ['"Barlow Semi Condensed"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(11,42,60,0.03), 0 10px 28px -18px rgba(11,42,60,0.22)',
        lift: '0 1px 0 rgba(11,42,60,0.04), 0 18px 34px -18px rgba(11,42,60,0.34)',
        pop: '0 24px 60px -20px rgba(8,30,44,0.45), 0 2px 6px rgba(8,30,44,0.12)',
        press: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(8,60,80,0.28)',
      },
      keyframes: {
        pop: { from: { opacity: 0, transform: 'translateY(8px) scale(0.985)' }, to: { opacity: 1, transform: 'none' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateX(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        sweep: { from: { transform: 'rotate(-120deg)' } },
      },
      animation: {
        pop: 'pop 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        fade: 'fade 140ms ease-out',
        'slide-in': 'slideIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
}
