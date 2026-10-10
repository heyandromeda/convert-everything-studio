import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * connect-src 'self' is the key privacy guarantee: even if a dependency misbehaved,
 * the browser would refuse to send data to any other origin.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': `${CSP}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
}

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
      const vercel = {
        headers: [
          { source: '/(.*)', headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) },
          { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
          { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        ],
      }
      this.emitFile({ type: 'asset', fileName: 'vercel.json', source: JSON.stringify(vercel, null, 2) })
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
        theme_color: '#111318',
        background_color: '#111318',
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
        globIgnores: ['**/vendor/**', '**/avif_enc*', '**/pdf.worker*', '**/ffmpeg*'],
        maximumFileSizeToCacheInBytes: 1024 * 1024,
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
