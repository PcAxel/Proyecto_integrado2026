import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-fyag.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'FYAG Terreno',
        short_name: 'FYAG',
        description: 'App de terreno · Frío y Agroindustria SpA',
        theme_color: '#0B2A3C',
        background_color: '#EEF3F6',
        display: 'standalone',
        start_url: '/app',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.js'], setupFiles: ['src/test-setup.js'] },
})
