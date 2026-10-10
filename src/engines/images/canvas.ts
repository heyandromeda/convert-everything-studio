import { ConversionError } from '@/lib/errors'
import type { DecodedImage } from './decode'

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
export type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c
  }
  return new OffscreenCanvas(width, height)
}

export function releaseCanvas(c: AnyCanvas) {
  // Shrinking frees the backing store promptly on iOS, which caps total canvas memory.
  c.width = 0
  c.height = 0
}

export function drawToCanvas(img: DecodedImage, width: number, height: number, background: string | null): { canvas: AnyCanvas; ctx: AnyContext } {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: false }) as AnyContext | null
  if (!ctx) {
    throw new ConversionError('out-of-memory', 'The browser could not allocate an image buffer', `A ${width}×${height} canvas could not be created.`, 'Choose a smaller output size.')
  }
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, 0, 0, width, height)
  return { canvas, ctx }
}

export function getPixels(ctx: AnyContext, width: number, height: number): ImageData {
  try {
    return ctx.getImageData(0, 0, width, height)
  } catch {
    throw new ConversionError('out-of-memory', 'The browser could not read the image pixels', 'Reading pixel data failed, usually due to memory limits.', 'Choose a smaller output size.')
  }
}

export async function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  let blob: Blob | null
  if ('convertToBlob' in canvas) {
    blob = await canvas.convertToBlob({ type, quality })
  } else {
    blob = await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality))
  }
  if (!blob || blob.size === 0) {
    throw new ConversionError('out-of-memory', 'The image could not be encoded', 'The browser returned no data from the canvas encoder.', 'Try a smaller output size.')
  }
  if (blob.type && blob.type !== type) {
    throw new ConversionError('codec-unavailable', `This browser cannot encode ${type.split('/')[1].toUpperCase()}`, `The browser produced ${blob.type} instead.`)
  }
  return blob
}

/** Samples alpha to decide whether transparency is actually used. */
export function usesTransparency(data: ImageData): boolean {
  const d = data.data
  const step = Math.max(1, Math.floor(d.length / 4 / 250_000)) * 4
  for (let i = 3; i < d.length; i += step) if (d[i] < 255) return true
  return false
}
