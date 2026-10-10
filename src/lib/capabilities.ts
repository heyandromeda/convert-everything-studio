import type { Capabilities } from '@/registry/types'

function detectIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

let cached: Capabilities | null = null

export function getCapabilities(): Capabilities {
  if (cached) return cached
  const isIOS = detectIOS()
  const isMobile = isIOS || /Android|Mobile/i.test(navigator.userAgent)
  let webShareFiles = false
  try {
    webShareFiles =
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'probe.txt', { type: 'text/plain' })] })
  } catch {
    webShareFiles = false
  }
  cached = {
    isIOS,
    isMobile,
    webAssembly: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    workers: typeof Worker !== 'undefined',
    webShareFiles,
    // Native HEIC/AVIF support is learned by attempting to decode the user's own file.
    nativeHeicDecode: null,
    nativeAvifDecode: null,
    // iOS Safari refuses to allocate canvases above ~16.7 megapixels.
    maxCanvasPixels: isIOS ? 16_777_216 : isMobile ? 33_554_432 : 100_000_000,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  }
  return cached
}

export function maxConcurrency(caps: Capabilities): number {
  if (caps.isMobile) return 1
  const cores = navigator.hardwareConcurrency || 2
  return Math.max(1, Math.min(3, Math.floor(cores / 2)))
}
