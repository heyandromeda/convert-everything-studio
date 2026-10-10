import type { DetectedFile, FileMetadata } from '@/registry/types'
import { parseJpeg, parsePng } from './exif'

const HEAD_BYTES = 256 * 1024

function gifInfo(b: Uint8Array) {
  const width = b[6] | (b[7] << 8)
  const height = b[8] | (b[9] << 8)
  let p = 13
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1))
  let frames = 0
  let transparent = false
  while (p < b.length) {
    const block = b[p]
    if (block === 0x3b) break
    if (block === 0x21) {
      if (b[p + 1] === 0xf9 && b[p + 3] & 1) transparent = true
      p += 2
      while (p < b.length && b[p] !== 0) p += b[p] + 1
      p++
    } else if (block === 0x2c) {
      frames++
      if (frames > 1) break
      const packed = b[p + 9]
      p += 10
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1))
      p++ // LZW min code size
      while (p < b.length && b[p] !== 0) p += b[p] + 1
      p++
    } else break
  }
  return { width, height, animated: frames > 1, hasAlpha: transparent }
}

function webpInfo(b: Uint8Array) {
  const chunk = String.fromCharCode(...b.subarray(12, 16))
  const dv = new DataView(b.buffer, b.byteOffset)
  if (chunk === 'VP8X') {
    const flags = b[20]
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
    return { width, height, hasAlpha: !!(flags & 0x10), animated: !!(flags & 0x02), hasExif: !!(flags & 0x08), hasXmp: !!(flags & 0x04), hasIcc: !!(flags & 0x20) }
  }
  if (chunk === 'VP8L') {
    const bits = dv.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, hasAlpha: !!((bits >> 28) & 1), animated: false }
  }
  if (chunk === 'VP8 ') {
    return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, hasAlpha: false, animated: false }
  }
  return {}
}

function bmpInfo(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset)
  const bpp = dv.getUint16(28, true)
  return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)), hasAlpha: bpp === 32 }
}

function loadMediaElement(file: File, kind: 'video' | 'audio'): Promise<{ duration?: number; width?: number; height?: number; playable: boolean }> {
  return new Promise((resolve) => {
    const el = document.createElement(kind)
    const url = URL.createObjectURL(file)
    const done = (r: { duration?: number; width?: number; height?: number; playable: boolean }) => {
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
      resolve(r)
    }
    const timer = setTimeout(() => done({ playable: false }), 6000)
    el.preload = 'metadata'
    el.muted = true
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement
      done({
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
        width: kind === 'video' ? v.videoWidth || undefined : undefined,
        height: kind === 'video' ? v.videoHeight || undefined : undefined,
        playable: true,
      })
    }
    el.onerror = () => done({ playable: false })
    el.src = url
  })
}

async function imageDimsByDecode(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const b = await createImageBitmap(file)
      const r = { width: b.width, height: b.height }
      b.close()
      return r
    }
  } catch {
    /* try <img> */
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Reads lightweight metadata. Only headers are parsed where possible; heavy parsers
 * are loaded lazily and only for the relevant formats.
 */
export async function inspectMetadata(file: File, detected: Omit<DetectedFile, 'metadata'>): Promise<FileMetadata> {
  const fmt = detected.formatId
  const meta: FileMetadata = {}
  if (!fmt) return meta
  try {
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
    switch (fmt) {
      case 'png':
      case 'apng': {
        const p = parsePng(head)
        meta.image = { width: p.width, height: p.height, hasAlpha: p.hasAlpha, animated: p.animated, frameCount: p.frameCount, hasExif: p.hasExif || p.hasText, hasIcc: p.hasIcc }
        break
      }
      case 'jpeg': {
        const j = parseJpeg(head)
        meta.image = { width: j.width, height: j.height, hasAlpha: false, orientation: j.orientation, hasExif: j.hasExif, hasGps: j.hasGps, hasXmp: j.hasXmp, hasIcc: j.hasIcc, cameraModel: j.cameraModel }
        if (j.orientation && j.orientation >= 5 && j.width && j.height) {
          meta.image.width = j.height
          meta.image.height = j.width
        }
        break
      }
      case 'gif':
        meta.image = gifInfo(new Uint8Array(await file.arrayBuffer()).subarray(0, Math.min(file.size, 4 * 1024 * 1024)))
        break
      case 'webp':
        meta.image = webpInfo(head)
        break
      case 'bmp':
        meta.image = bmpInfo(head)
        break
      case 'svg': {
        const { sanitizeSvg } = await import('@/engines/images/decode')
        const s = await sanitizeSvg(await file.text())
        meta.image = { width: s.width, height: s.height, hasAlpha: true }
        break
      }
      case 'heic':
      case 'avif':
      case 'tiff':
      case 'ico': {
        const dims = fmt === 'tiff' ? null : await imageDimsByDecode(file)
        meta.image = dims ? { ...dims } : {}
        if (fmt === 'heic' && !dims) meta.notes = ['This browser cannot display HEIC itself, so the built-in HEIC decoder (about 2 MB) is used during conversion.']
        if (fmt === 'avif' && !dims) meta.notes = ['This browser cannot decode AVIF images.']
        if (fmt === 'ico' || fmt === 'avif') meta.image.hasAlpha = true
        break
      }
      case 'mp4': case 'mov': case 'webm': case 'mkv': case 'avi': case '3gp': {
        const m = await loadMediaElement(file, 'video')
        meta.media = { duration: m.duration, width: m.width, height: m.height, playableNatively: m.playable }
        break
      }
      case 'mp3': case 'wav': case 'aac': case 'm4a': case 'ogg': case 'opus': case 'flac': case 'aiff': {
        const m = await loadMediaElement(file, 'audio')
        meta.media = { duration: m.duration, playableNatively: m.playable }
        break
      }
      default: {
        const extra = await import('./metadata-extra')
        Object.assign(meta, await extra.inspectExtra(file, fmt))
      }
    }
  } catch {
    meta.notes = [...(meta.notes ?? []), 'Some details could not be read from this file.']
  }
  return meta
}
