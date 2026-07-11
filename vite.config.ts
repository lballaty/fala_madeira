import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.svg', 'apple-touch-icon.png', 'favicon-48x48.png'],
        workbox: {
          // App-shell precache: SPA shell (index.html) + built JS/CSS/img/fonts so the
          // app boots offline (CONTENT-ARCHITECTURE §10 "app-shell precached (PWA)").
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
          // The bundled 168-lesson content pack (offline default, §10) puts the content
          // chunk near 3 MB — above Workbox's 2 MiB default, which HARD-FAILS the build.
          // Precaching it is intentional (offline-first content); allow up to 5 MiB.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // SPA fallback so any client-side route resolves to the precached shell offline.
          navigateFallback: 'index.html',
          // Never let the SW intercept Supabase auth or edge-function endpoints via the
          // navigation fallback (those must always hit the network / be handled below).
          navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            // (1) Static assets: cache-first with bounded expiration. Covers cross-origin
            //     fonts/images and any assets not swept into the precache manifest.
            {
              urlPattern: ({ request }) =>
                ['style', 'script', 'worker', 'image', 'font'].includes(request.destination),
              handler: 'CacheFirst',
              options: {
                cacheName: 'fala-static-assets',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30d
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // (2) Supabase Storage objects (content packs + pre-generated audio):
            //     stale-while-revalidate — serve cached bytes instantly, refresh in the
            //     background. Packs are versioned (§10) so stale bytes are safe.
            {
              urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'fala-content-packs',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30d
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true, // support ranged audio streaming from cache
              },
            },
            // (3) Supabase REST reads (GET only): network-first with a short timeout and a
            //     cache fallback so reads keep working offline. POST/PATCH/DELETE mutations
            //     are NOT matched here (method: 'GET') and always go to the network — see §10
            //     offline write queue; mutations must never be served from cache.
            {
              urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/.*/i,
              method: 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'fala-supabase-reads',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 }, // 1d
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // NEVER CACHED (no matching route => default network handling):
            //   - /auth/**            (Supabase auth: tokens, sessions)
            //   - /functions/v1/**    (edge functions: gemini/tts POSTs, AI calls)
            //   - all non-GET Supabase requests (mutations)
            // These intentionally have no runtimeCaching entry so they always hit the network.
          ],
        },
        manifest: {
          name: 'FalaMadeira',
          short_name: 'FalaMadeira',
          description: 'European Portuguese Training System for Madeira',
          theme_color: '#0284c7',
          background_color: '#f8fafc',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            // The bundled offline content pack (~2.7 MB source) gets its own chunk so the
            // app-shell chunk stays small and the pack loads/caches independently.
            if (id.includes('content/packs/seed-course')) return 'content-pack';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
