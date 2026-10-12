import { ConversionError, throwIfAborted } from '@/lib/errors'
import { outputName } from '@/lib/files'
import { stripJpegMetadata, stripPngMetadata } from '@/lib/exif'
import { mimeFor } from '@/registry/formats'
import type { ConvertContext, ConvertResult, ConverterFn } from '@/registry/types'
import { decodeImage, type DecodedImage } from './decode'
import { computeTargetSize, qualityFrom, type TargetSize } from './geometry'
import { canvasToBlob, drawToCanvas, getPixels, releaseCanvas, usesTransparency } from './canvas'
import { encodeInWorker } from './encoder-client'
import { bytesToBase64, encodeBmp, encodeIco, svgWrapperForRaster } from './bitmap-writers'

const NO_ALPHA = new Set(['jpeg', 'bmp', 'pdf'])

interface Prepared {
  img: DecodedImage
  size: TargetSize
  warnings: string[]
}

async function prepare(ctx: ConvertContext, target: string): Promise<Prepared> {
  const { file, input, options, caps } = ctx
  ctx.onProgress({ stage: 'preparing', message: 'Decoding image' })
  const fmt = input.formatId ?? ''
  // Vector sources are rasterised directly at the requested size.
  let img = await decodeImage(file, fmt, caps).catch((e: unknown) => {
    // A browser refuses to decode a bitmap far beyond its canvas limit; say so instead of "damaged".
    const { width = 0, height = 0 } = input.metadata.image ?? {}
    if (e instanceof ConversionError && e.code === 'decode-failed' && fmt !== 'svg' && width * height > caps.maxCanvasPixels) {
      throw new ConversionError(
        'too-large',
        'This image is too large to open in the browser',
        `It is ${width.toLocaleString()}×${height.toLocaleString()} pixels (${Math.round((width * height) / 1e6).toLocaleString()} megapixels), more than this browser can decode.`,
        'Reduce its size in a desktop app first.',
      )
    }
    throw e
  })
  let size = computeTargetSize(img.width, img.height, options, caps.maxCanvasPixels)
  if (fmt === 'svg' && (size.width !== img.width || size.height !== img.height)) {
    const scale = size.width / img.width
    img.close()
    img = await decodeImage(file, fmt, caps, scale)
    size = { ...size, width: img.width, height: img.height }
  }
  const warnings: string[] = []
  if (size.limitedBy === 'canvas') {
    warnings.push(
      `Output was scaled to ${size.width}×${size.height} because this browser cannot process images larger than ${Math.round(caps.maxCanvasPixels / 1e6)} megapixels.`,
    )
  }
  if (input.metadata.image?.animated && target !== input.formatId) {
    warnings.push('Only the first frame of this animated image was converted.')
  }
  throwIfAborted(ctx.signal)
  return { img, size, warnings }
}

function background(ctx: ConvertContext, target: string): string | null {
  return NO_ALPHA.has(target) ? ((ctx.options.background as string) || '#ffffff') : null
}

async function rasterTo(ctx: ConvertContext, target: string): Promise<ConvertResult> {
  const { img, size, warnings } = await prepare(ctx, target)
  const bg = background(ctx, target)
  ctx.onProgress({ stage: 'processing', message: 'Encoding' })
  const { canvas, ctx: c2d } = drawToCanvas(img, size.width, size.height, bg)
  img.close()
  try {
    let blob: Blob
    const quality = qualityFrom(ctx.options)
    if (target === 'png') {
      blob = await canvasToBlob(canvas, 'image/png')
    } else if (target === 'jpeg') {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality / 100)
    } else if (target === 'webp' || target === 'avif' || target === 'gif' || target === 'tiff') {
      const pixels = getPixels(c2d, size.width, size.height)
      if (target === 'gif' && usesTransparency(pixels)) warnings.push('GIF supports only fully transparent or fully opaque pixels; soft edges were hardened.')
      releaseCanvas(canvas)
      ctx.onProgress({ stage: target === 'webp' || target === 'avif' ? 'loading-engine' : 'processing', message: 'Starting encoder' })
      const buf = await encodeInWorker(
        target,
        pixels,
        { quality, lossless: ctx.options.lossless === true, speed: ctx.caps.isMobile ? 8 : 6 },
        ctx.signal,
      )
      blob = new Blob([buf], { type: mimeFor(target) })
      if (target === 'gif') warnings.push('GIF is limited to 256 colours, so photos may show banding.')
    } else if (target === 'bmp') {
      const pixels = getPixels(c2d, size.width, size.height)
      blob = new Blob([encodeBmp(pixels.data, size.width, size.height) as BlobPart], { type: 'image/bmp' })
    } else {
      throw new Error(`No raster encoder for ${target}`)
    }
    return {
      outputs: [{ blob, name: outputName(ctx.file.name, target, target === ctx.input.formatId ? '-converted' : ''), formatId: target, meta: { width: size.width, height: size.height } }],
      warnings,
    }
  } finally {
    releaseCanvas(canvas)
  }
}

export const toRaster = (target: string): ConverterFn => (ctx) => rasterTo(ctx, target)

export const toIco: ConverterFn = async (ctx) => {
  const { img, warnings } = await prepare(ctx, 'ico')
  const requested = String(ctx.options.icoSizes ?? '16,32,48,256')
    .split(',')
    .map(Number)
    .filter((n) => n > 0 && n <= 256)
  ctx.onProgress({ stage: 'processing', message: 'Rendering icon sizes' })
  const images = []
  for (const s of requested) {
    // Icons are square; non-square sources are centred with transparent padding.
    const scale = Math.min(s / img.width, s / img.height)
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const { canvas, ctx: c2d } = drawToCanvas({ ...img, close: () => {} }, s, s, null)
    c2d.clearRect(0, 0, s, s)
    c2d.drawImage(img.source, Math.round((s - w) / 2), Math.round((s - h) / 2), w, h)
    const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer())
    releaseCanvas(canvas)
    images.push({ width: s, height: s, png })
  }
  img.close()
  if (img.width !== img.height) warnings.push('The image is not square, so it was centred on a transparent square canvas.')
  const data = encodeIco(images)
  return {
    outputs: [{ blob: new Blob([data as BlobPart], { type: 'image/x-icon' }), name: outputName(ctx.file.name, 'ico'), formatId: 'ico', meta: { width: Math.max(...requested), height: Math.max(...requested) } }],
    warnings,
  }
}

export const toSvgWrapper: ConverterFn = async (ctx) => {
  const { img, size, warnings } = await prepare(ctx, 'svg')
  const { canvas } = drawToCanvas(img, size.width, size.height, null)
  img.close()
  const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer())
  releaseCanvas(canvas)
  const svg = svgWrapperForRaster(bytesToBase64(png), size.width, size.height)
  warnings.push('This SVG embeds the bitmap. It will not become sharper when scaled and is not editable as vector shapes.')
  return {
    outputs: [{ blob: new Blob([svg], { type: 'image/svg+xml' }), name: outputName(ctx.file.name, 'svg'), formatId: 'svg', meta: { width: size.width, height: size.height } }],
    warnings,
  }
}

export const imageToPdf: ConverterFn = async (ctx) => {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = String(ctx.options.pageSize ?? 'image')
  const warnings: string[] = []
  let embedded
  let w: number
  let h: number
  const resizing = (ctx.options.resizeMode ?? 'none') !== 'none'
  const orientation = ctx.input.metadata.image?.orientation
  // Rotated JPEGs go through the canvas. pdf-lib writes every embedded image, even one never
  // placed on a page, so the original must not be embedded first and discarded.
  if (ctx.input.formatId === 'jpeg' && !resizing && (!orientation || orientation === 1)) {
    // Embed the original JPEG data (no re-compression), minus EXIF, GPS, XMP and comments.
    embedded = await doc.embedJpg(stripJpegMetadata(new Uint8Array(await ctx.file.arrayBuffer())).data)
    w = embedded.width
    h = embedded.height
  }
  if (!embedded) {
    const prepared = await prepare(ctx, 'pdf')
    warnings.push(...prepared.warnings)
    const { canvas } = drawToCanvas(prepared.img, prepared.size.width, prepared.size.height, '#ffffff')
    prepared.img.close()
    const isPhoto = ctx.input.formatId === 'jpeg' || ctx.input.formatId === 'heic'
    const blob = await canvasToBlob(canvas, isPhoto ? 'image/jpeg' : 'image/png', isPhoto ? 0.92 : undefined)
    releaseCanvas(canvas)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    embedded = isPhoto ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    w = prepared.size.width
    h = prepared.size.height
  }
  addImagePage(doc, embedded, w!, h!, page)
  const bytes = await doc.save()
  return { outputs: [{ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: outputName(ctx.file.name, 'pdf'), formatId: 'pdf', meta: { pages: 1 } }], warnings }
}

const PAGE_SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] }

export function addImagePage(
  doc: import('pdf-lib').PDFDocument,
  img: import('pdf-lib').PDFImage,
  pxW: number,
  pxH: number,
  pageSize: string,
) {
  if (pageSize === 'image' || !PAGE_SIZES[pageSize]) {
    // 96 dpi → points
    const pw = (pxW * 72) / 96
    const ph = (pxH * 72) / 96
    const page = doc.addPage([pw, ph])
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph })
    return
  }
  let [pw, ph] = PAGE_SIZES[pageSize]
  if (pxW > pxH) [pw, ph] = [ph, pw]
  const margin = 28
  const scale = Math.min((pw - margin * 2) / pxW, (ph - margin * 2) / pxH)
  const dw = pxW * scale
  const dh = pxH * scale
  const page = doc.addPage([pw, ph])
  page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh })
}

export const stripMetadata: ConverterFn = async (ctx) => {
  const buf = new Uint8Array(await ctx.file.arrayBuffer())
  const fmt = ctx.input.formatId
  ctx.onProgress({ stage: 'processing', message: 'Removing metadata' })
  const { data, report } = fmt === 'jpeg' ? stripJpegMetadata(buf) : fmt === 'png' || fmt === 'apng' ? stripPngMetadata(buf) : (() => {
    throw new ConversionError('unsupported-input', 'Lossless metadata removal is not available for this format', 'Only JPEG and PNG are supported.')
  })()
  const warnings: string[] = []
  warnings.push(report.removed.length ? `Removed: ${report.removed.join(', ')}.` : 'No removable metadata was found; the image data is unchanged.')
  if (report.kept.length) warnings.push(`Kept: ${report.kept.join(', ')} (needed to display the image correctly).`)
  const formatId = fmt === 'jpeg' ? 'jpeg' : 'png'
  return {
    outputs: [{ blob: new Blob([data as BlobPart], { type: mimeFor(formatId) }), name: outputName(ctx.file.name, formatId, '-clean'), formatId, meta: { width: ctx.input.metadata.image?.width, height: ctx.input.metadata.image?.height } }],
    warnings,
  }
}
