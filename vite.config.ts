import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'HitsIt',
        short_name: 'HitsIt',
        description: 'Place the song on the timeline. Solo practice.',
        theme_color: '#12131A',
        background_color: '#12131A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Separate artwork: launchers crop maskable icons, so this one keeps
          // the mark inside the centre 80% safe zone.
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The Spotify SDK and API must always hit the network — never serve them stale.
        navigateFallbackDenylist: [/^\/callback/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/i\.scdn\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'album-art',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // The project lives on the Windows drive (/mnt/c) while Node runs in
      // WSL. inotify does not cross that mount, so Vite never sees an edit and
      // silently serves stale modules — changes appear to have no effect at
      // all. Polling is the only thing that works here.
      usePolling: true,
      interval: 300,
    },
  },
})
