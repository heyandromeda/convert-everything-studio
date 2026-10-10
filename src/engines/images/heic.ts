import { ConversionError } from '@/lib/errors'
import type { DecodedImage } from './decode'

interface HeifImage {
  get_width(): number
  get_height(): number
  display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (out: { data: Uint8ClampedArray; width: number; height: number } | null) => void): void
  free?: () => void
}
interface LibHeif {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
}

let libPromise: Promise<LibHeif> | null = null

/** libheif (LGPL-3.0) compiled to WebAssembly, loaded only when the browser cannot decode HEIC itself. */
function loadLibheif(): Promise<LibHeif> {
  libPromise ??= (async () => {
    const mod = (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')) as unknown as { default: () => LibHeif | Promise<LibHeif> }
    const lib = await mod.default()
    const ready = (lib as unknown as { ready?: Promise<unknown> }).ready
    if (ready) await ready
    return lib
  })()
  return libPromise
}

export async function decodeHeicWasm(blob: Blob, maxPixels: number): Promise<DecodedImage> {
  let lib: LibHeif
  try {
    lib = await loadLibheif()
  } catch {
    libPromise = null
    throw new ConversionError('engine-load-failed', 'The HEIC decoder could not be loaded', navigator.onLine ? 'The decoder failed to start.' : 'You are offline and the HEIC decoder has not been downloaded on this device yet.')
  }
  const images = new lib.HeifDecoder().decode(new Uint8Array(await blob.arrayBuffer()))
  const image = images[0]
  if (!image) throw new ConversionError('corrupt', 'This HEIC file has no readable image', 'No primary image was found inside the HEIC container.')
  const width = image.get_width()
  const height = image.get_height()
  if (width * height > maxPixels * 2) {
    throw new ConversionError('too-large', 'This HEIC image is too large to decode here', `At ${width}×${height} it exceeds this browser's memory budget for images.`)
  }
  const out = await new Promise<{ data: Uint8ClampedArray; width: number; height: number }>((resolve, reject) =>
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (d) => (d ? resolve(d) : reject(new ConversionError('decode-failed', 'This HEIC image could not be decoded', 'libheif reported a decoding error.')))),
  )
  for (const img of images) img.free?.()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out.data.buffer as ArrayBuffer, out.data.byteOffset, out.data.byteLength), width, height), 0, 0)
  return { source: canvas, width, height, close: () => { canvas.width = 0 } }
}
