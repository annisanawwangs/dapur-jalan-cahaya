import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      includeAssets: [
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
        'logo-mjc-white-transparent.png',
      ],

      manifest: {
        name: 'Dapur Jalan Cahaya',
        short_name: 'Dapur JC',
        description: 'Dashboard operasional Dapur Jalan Cahaya',

        start_url: '/',
        scope: '/',

        display: 'standalone',
        orientation: 'any',

        background_color: '#ffffff',
        theme_color: '#0B8779',

        lang: 'id-ID',

        categories: [
          'business',
          'productivity'
        ],

        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        cleanupOutdatedCaches: true,
        globIgnores: ['**/ocr/**'],
        navigateFallback: '/index.html',

        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webp,woff2}'
        ]
      }
    })
  ],
})
