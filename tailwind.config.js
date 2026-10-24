/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        surface: '#FFFFFF',
        line: '#E2E8F0',
        ink: { DEFAULT: '#0F172A', soft: '#64748B', faint: '#94A3B8' },
        brand: { DEFAULT: '#2563EB', dark: '#1D4ED8', tint: '#EFF6FF' },
        ok: { DEFAULT: '#16A34A', bg: '#DCFCE7' },
        warn: { DEFAULT: '#D97706', bg: '#FEF3C7' },
        crit: { DEFAULT: '#DC2626', bg: '#FEE2E2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,0.04)' },
    },
  },
  plugins: [],
}
