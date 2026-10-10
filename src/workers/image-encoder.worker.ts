/// <reference lib="webworker" />
import type { EncodeRequest, EncodeResponse } from '@/engines/images/encoder-protocol'

declare const self: DedicatedWorkerGlobalScope

async function encode(req: EncodeRequest): Promise<ArrayBuffer> {
  const image = new ImageData(new Uint8ClampedArray(req.pixels), req.width, req.height)
  switch (req.format) {
    case 'webp': {
      const { default: enc } = await import('@jsquash/webp/encode')
      return enc(image, req.lossless ? { lossless: 1, quality: 100, exact: 1 } : { quality: req.quality, method: 4, alpha_quality: 100 })
    }
    case 'avif': {
      const { default: enc } = await import('@jsquash/avif/encode')
      return enc(image, { quality: req.lossless ? 100 : req.quality, speed: req.speed ?? 6, lossless: !!req.lossless })
    }
    case 'gif': {
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
      const data = image.data
      let transparent = false
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 128) {
          transparent = true
          break
        }
      }
      const palette = quantize(data, 256, { format: transparent ? 'rgba4444' : 'rgb565', oneBitAlpha: transparent })
      const index = applyPalette(data, palette, transparent ? 'rgba4444' : 'rgb565')
      const gif = GIFEncoder()
      let transparentIndex = 0
      if (transparent) {
        transparentIndex = palette.findIndex((c: number[]) => c[3] === 0)
      }
      gif.writeFrame(index, req.width, req.height, {
        palette,
        transparent: transparent && transparentIndex >= 0,
        transparentIndex: Math.max(0, transparentIndex),
      })
      gif.finish()
      const bytes = gif.bytes()
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    }
    case 'tiff': {
      const UTIF = (await import('utif')).default
      return UTIF.encodeImage(image.data.buffer as ArrayBuffer, req.width, req.height)
    }
  }
}

self.onmessage = async (ev: MessageEvent<EncodeRequest>) => {
  const req = ev.data
  try {
    const buf = await encode(req)
    const res: EncodeResponse = { id: req.id, ok: true, data: buf }
    self.postMessage(res, [buf])
  } catch (e) {
    const res: EncodeResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    self.postMessage(res)
  }
}
