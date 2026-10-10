import { ConversionError } from '@/lib/errors'
import type { Capabilities } from '@/registry/types'

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image element failed to decode'))
    img.src = url
  })
}

async function decodeWithBrowser(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* fall back to <img>, which supports more formats on some browsers (e.g. HEIC on Safari) */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageElement(url)
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Decoded image has no dimensions')
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

async function decodeTiff(blob: Blob): Promise<DecodedImage> {
  const UTIF = (await import('utif')).default
  const buf = await blob.arrayBuffer()
  const ifds = UTIF.decode(buf)
  const page = ifds.find((i: { width?: number; t256?: number[] }) => (i.t256?.[0] ?? 0) > 0) ?? ifds[0]
  if (!page) throw new ConversionError('corrupt', 'The TIFF has no image data', 'No readable image page was found.')
  UTIF.decodeImage(buf, page, ifds)
  const rgba = UTIF.toRGBA8(page)
  const width = page.width as number
  const height = page.height as number
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength), width, height), 0, 0)
  return { source: canvas, width, height, close: () => { canvas.width = 0 } }
}

/** Removes scripts, event handlers and external references before an SVG is rasterised. */
export async function sanitizeSvg(text: string): Promise<{ svg: string; width: number; height: number }> {
  const DOMPurify = (await import('dompurify')).default
  const clean = DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script'],
  })
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new ConversionError('corrupt', 'This SVG could not be read', 'The file does not contain a valid <svg> element.')
  }
  // Drop any reference that is not an inline data URI or local fragment.
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of ['href', 'xlink:href']) {
      const v = el.getAttribute(attr)
      if (v && !v.startsWith('#') && !v.startsWith('data:image/')) el.removeAttribute(attr)
    }
  }
  const num = (v: string | null) => {
    if (!v || v.endsWith('%')) return NaN
    const n = parseFloat(v)
    if (v.endsWith('mm')) return n * 3.7795
    if (v.endsWith('cm')) return n * 37.795
    if (v.endsWith('in')) return n * 96
    if (v.endsWith('pt')) return n * 1.3333
    return n
  }
  let width = num(root.getAttribute('width'))
  let height = num(root.getAttribute('height'))
  const vb = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  if ((!width || !height) && vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (width && !height) height = (width * vb[3]) / vb[2]
    else if (height && !width) width = (height * vb[2]) / vb[3]
    else {
      width = vb[2]
      height = vb[3]
    }
  }
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    width = 1024
    height = 1024
  }
  width = Math.max(1, Math.round(width))
  height = Math.max(1, Math.round(height))
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return { svg: new XMLSerializer().serializeToString(root), width, height }
}

async function decodeSvg(blob: Blob, scaleHint: number): Promise<DecodedImage> {
  const { svg, width, height } = await sanitizeSvg(await blob.text())
  // Rasterise vector art at the requested scale so upscaled output stays sharp.
  const scaled = svg
    .replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${Math.round(width * scaleHint)}"`)
    .replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${Math.round(height * scaleHint)}"`)
  const url = URL.createObjectURL(new Blob([scaled], { type: 'image/svg+xml' }))
  try {
    const img = await loadImageElement(url)
    return { source: img, width: Math.round(width * scaleHint), height: Math.round(height * scaleHint), close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new ConversionError('decode-failed', 'This SVG could not be rendered', 'The browser could not draw this SVG after it was sanitised.', 'SVGs that depend on external files or fonts may not render.')
  }
}

export async function decodeImage(blob: Blob, formatId: string, caps: Capabilities, svgScale = 1): Promise<DecodedImage> {
  try {
    if (formatId === 'tiff') return await decodeTiff(blob)
    if (formatId === 'svg') return await decodeSvg(blob, svgScale)
    return await decodeWithBrowser(blob)
  } catch (e) {
    if (e instanceof ConversionError) throw e
    if (formatId === 'heic') {
      throw new ConversionError(
        'codec-unavailable',
        'HEIC decoding is unavailable in this browser',
        caps.isIOS
          ? 'Safari could not decode this HEIC image. It may use an unsupported HEIC variant.'
          : 'Only Safari (iPhone, iPad and Mac) can decode HEIC images natively. This browser cannot.',
        caps.isIOS ? 'Try exporting the photo as JPEG from the Photos app.' : 'Open this page in Safari, or export the photo as JPEG first.',
      )
    }
    if (formatId === 'avif') {
      throw new ConversionError('codec-unavailable', 'AVIF decoding is unavailable in this browser', 'This browser cannot decode AVIF images.', 'Update the browser (Safari 16+, Chrome 85+, Firefox 93+).')
    }
    throw new ConversionError('decode-failed', 'This image could not be decoded', 'The browser could not read the image data. The file may be damaged or use an unusual encoding.', 'Try opening and re-saving it in another app.')
  }
}
