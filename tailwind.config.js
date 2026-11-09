/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutros y estados: variables CSS (src/styles/index.css). El ERP las cambia a oscuro con html.tema-erp.
        slate: { 50: 'rgb(var(--c-slate-50) / <alpha-value>)', 100: 'rgb(var(--c-slate-100) / <alpha-value>)', 200: 'rgb(var(--c-slate-200) / <alpha-value>)', 300: 'rgb(var(--c-slate-300) / <alpha-value>)', 400: 'rgb(var(--c-slate-400) / <alpha-value>)', 500: 'rgb(var(--c-slate-500) / <alpha-value>)', 600: 'rgb(var(--c-slate-600) / <alpha-value>)', 700: 'rgb(var(--c-slate-700) / <alpha-value>)', 800: 'rgb(var(--c-slate-800) / <alpha-value>)', 900: 'rgb(var(--c-slate-900) / <alpha-value>)' },
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        line: { DEFAULT: 'rgb(var(--c-line) / <alpha-value>)', strong: 'rgb(var(--c-line-strong) / <alpha-value>)' },
        ink: { DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)', soft: 'rgb(var(--c-ink-soft) / <alpha-value>)', faint: 'rgb(var(--c-ink-faint) / <alpha-value>)' },
        // Glaciar: la acción principal. Petróleo: la identidad (barra lateral y paneles de instrumentos).
        brand: { DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)', dark: 'rgb(var(--c-brand-dark) / <alpha-value>)', light: 'rgb(var(--c-brand-light) / <alpha-value>)', tint: 'rgb(var(--c-brand-tint) / <alpha-value>)' },
        // Botón principal: glaciar en la app de terreno, naranja corporativo en el ERP.
        accion: { DEFAULT: 'rgb(var(--c-accion) / <alpha-value>)', dark: 'rgb(var(--c-accion-dark) / <alpha-value>)' },
        deep: { DEFAULT: '#0B2A3C', 800: '#0F3650', 700: '#164563', 600: '#1F5878' },
        ice: '#7DE3F4',
        // Durazno de cosecha: el único acento cálido, reservado para lo que pide atención.
        harvest: { DEFAULT: '#F0A030', bg: 'rgb(var(--c-harvest-bg) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--c-ok) / <alpha-value>)', bg: 'rgb(var(--c-ok-bg) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--c-warn) / <alpha-value>)', bg: 'rgb(var(--c-warn-bg) / <alpha-value>)' },
        crit: { DEFAULT: 'rgb(var(--c-crit) / <alpha-value>)', bg: 'rgb(var(--c-crit-bg) / <alpha-value>)' },
        // Paleta corporativa oscura (uso: bg-fyag-bg, text-fyag-cream, border-fyag-teal…).
        fyag: {
          bg: 'rgb(var(--c-f-bg) / <alpha-value>)', // Lienzo principal oscuro estilo Linear
          panel: 'rgb(var(--c-f-panel) / <alpha-value>)', // Superficie de tarjetas y bloques
          deep: 'rgb(var(--c-f-deep) / <alpha-value>)', // Verde petróleo profundo
          teal: 'rgb(var(--c-f-teal) / <alpha-value>)', // Primario / Hover / Estado activo
          ice: 'rgb(var(--c-f-ice) / <alpha-value>)', // Acento secundario / Íconos / Subtítulos
          cream: 'rgb(var(--c-f-cream) / <alpha-value>)', // Texto principal cálido y números KPI
          orange: '#C6601F', // CTA principal / Alertas / Margen crítico
        },
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
