// Single source of truth for the Content Security Policy and security headers.
// Used by vite.config.ts (meta tag, dist/_headers) and scripts/write-vercel-config.mjs (vercel.json).

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

export const SECURITY_HEADERS = {
  'Content-Security-Policy': `${CSP}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
}

export function vercelConfig() {
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite',
    installCommand: 'npm ci',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    headers: [
      { source: '/(.*)', headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
  }
}
