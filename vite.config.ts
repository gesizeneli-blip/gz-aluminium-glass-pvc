import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'GZ Aluminium Glass & PVC',
        short_name: 'GZ Alu',
        description: 'Menaxhim i punëtorisë dhe oferta për alumin, qelq dhe PVC',
        lang: 'sq',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0e11',
        theme_color: '#0a0e11',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          { urlPattern: /\/panels\/.*\.webp$/, handler: 'CacheFirst', options: { cacheName: 'door-panels', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } } }
        ]
      }
    })
  ],
  build: { chunkSizeWarningLimit: 2000 }
});
