import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { CSP, SECURITY_HEADERS, vercelConfig } from './security-headers.mjs'

/** Injects the CSP meta tag and writes host header files (Netlify `_headers`, `vercel.json`). */
function securityHeaders(): Plugin {
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    generateBundle() {
      const lines = ['/*', ...Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`)]
      lines.push('/assets/*', '  Cache-Control: public, max-age=31536000, immutable')
      lines.push('/sw.js', '  Cache-Control: no-cache')
      this.emitFile({ type: 'asset', fileName: '_headers', source: lines.join('\n') + '\n' })
      const { headers } = vercelConfig()
      this.emitFile({ type: 'asset', fileName: 'vercel.json', source: JSON.stringify({ headers }, null, 2) })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    securityHeaders(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Convert Everything',
        short_name: 'Convert',
        description: 'Private, on-device file conversion.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell and small engines are precached; large engines are cached on first use.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        globIgnores: ['**/vendor/**', '**/avif_enc*', '**/pdf.worker*', '**/ffmpeg*', '**/libheif*'],
        maximumFileSizeToCacheInBytes: 1024 * 1024,
        // Precache the app shell and the light image path only; larger engines are cached on first use.
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter((e) => e.size < 160 * 1024 || /assets\/index-[\w-]+\.js$/.test(e.url) || /webp_enc_simd-[\w-]+\.wasm$/.test(e.url)),
            warnings: [],
          }),
        ],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/vendor/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ce-engines', expiration: { maxEntries: 400 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Hashed build assets that were too large to precache.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ce-engines-assets', expiration: { maxEntries: 200 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['@jsquash/webp', '@jsquash/avif', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    target: ['es2022', 'safari16'],
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true, port: 4791, strictPort: true },
  preview: { host: true, port: 4792, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
})
