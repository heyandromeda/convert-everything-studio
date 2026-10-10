import type { OptionValues } from '@/registry/types'

export interface TargetSize {
  width: number
  height: number
  /** Set when dimensions were reduced to respect a browser limit rather than a user choice. */
  limitedBy?: 'canvas'
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Computes output dimensions from resize options. Aspect ratio is always preserved
 * except in the explicit "exact" mode with the aspect lock turned off.
 */
export function computeTargetSize(srcW: number, srcH: number, o: OptionValues, maxPixels: number): TargetSize {
  let w = srcW
  let h = srcH
  const mode = (o.resizeMode as string) ?? 'none'
  const allowUpscale = o.allowUpscale === true
  const reqW = num(o.width)
  const reqH = num(o.height)

  if (mode === 'percent') {
    const pct = num(o.percent) ?? 100
    w = (srcW * pct) / 100
    h = (srcH * pct) / 100
  } else if (mode === 'fit') {
    const preset = num(o.fitPreset)
    const boxW = preset ?? reqW ?? srcW
    const boxH = preset ?? reqH ?? srcH
    let scale = Math.min(boxW / srcW, boxH / srcH)
    if (!allowUpscale) scale = Math.min(1, scale)
    w = srcW * scale
    h = srcH * scale
  } else if (mode === 'exact') {
    const lock = o.lockAspect !== false
    if (lock) {
      if (reqW && reqH) {
        const scale = Math.min(reqW / srcW, reqH / srcH)
        w = srcW * scale
        h = srcH * scale
      } else if (reqW) {
        w = reqW
        h = (srcH * reqW) / srcW
      } else if (reqH) {
        h = reqH
        w = (srcW * reqH) / srcH
      }
    } else {
      w = reqW ?? srcW
      h = reqH ?? srcH
    }
  }

  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))
  const result: TargetSize = { width: w, height: h }
  if (w * h > maxPixels) {
    const s = Math.sqrt(maxPixels / (w * h))
    result.width = Math.max(1, Math.floor(w * s))
    result.height = Math.max(1, Math.floor(h * s))
    result.limitedBy = 'canvas'
  }
  return result
}

export function qualityFrom(o: OptionValues, fallback = 80): number {
  const preset = o.qualityPreset as string | undefined
  if (preset === 'best') return 92
  if (preset === 'balanced') return 80
  if (preset === 'small') return 60
  const q = num(o.quality)
  return q ? Math.min(100, Math.max(1, q)) : fallback
}
