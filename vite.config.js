import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BANNER = '/* (c) 2026 Apex Systems - Arquitectura y Desarrollo por Axel Plata. Todos los derechos reservados. */'

/**
 * Autoría en producción: deja BANNER como PRIMERA línea de todos los .js y .css del build.
 * - `generateBundle` lo agrega a los bundles DESPUÉS de minificar (el minificador borraría un comentario normal) y ANTES de que la PWA calcule
 *   su caché, así el service worker precachea exactamente lo que se publica.
 * - `closeBundle` (al final, tras la PWA) recorre dist/ y se lo agrega a lo que se generó después: service worker, workbox y registerSW.
 * No toca el código ni su rendimiento: es una línea de comentario por archivo. Solo corre en `vite build`.
 */
function bannerApex() {
  let outDir = 'dist'
  const conBanner = (texto) => (texto.startsWith(BANNER) ? texto : `${BANNER}\n${texto}`)
  const archivos = (dir) => readdirSync(dir).flatMap((n) => { const r = join(dir, n); return statSync(r).isDirectory() ? archivos(r) : [r] })
  return {
    name: 'apex-banner',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk') f.code = conBanner(f.code)
        else if (f.fileName.endsWith('.css') && typeof f.source === 'string') f.source = conBanner(f.source)
      }
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        for (const ruta of archivos(outDir)) {
          if (!/\.(js|css)$/.test(ruta)) continue
          const texto = readFileSync(ruta, 'utf8')
          if (!texto.startsWith(BANNER)) writeFileSync(ruta, conBanner(texto))
        }
      },
    },
  }
}


export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    bannerApex(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-fyag.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/app',
        name: 'FYAG Terreno',
        short_name: 'FYAG',
        description: 'App de terreno · Frío y Agroindustria SpA',
        lang: 'es-CL',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0B2A3C',
        background_color: '#EEF3F6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell y assets estáticos precacheados: la app abre sin señal.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        // Rutas del SPA sin red → index.html. La API nunca se sirve desde el shell.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
        runtimeCaching: [
          // Tipografías de Google: cambian poco, se sirven del caché y se actualizan en segundo plano.
          { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'fyag-fonts-css' } },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fyag-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // Datos de la API (autenticados, con datos personales): siempre red, jamás caché del SW.
          // El modo sin señal de los datos lo resuelve la cola de sincronización de la app (IndexedDB).
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.js'], setupFiles: ['src/test-setup.js'] },
})
