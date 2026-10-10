import { CanceledError, ConversionError, throwIfAborted } from '@/lib/errors'
import { outputName } from '@/lib/files'
import type { ConvertContext, ConverterFn } from '@/registry/types'
import { decodeImage } from '../images/decode'
import { drawToCanvas, releaseCanvas } from '../images/canvas'
import { computeTargetSize } from '../images/geometry'
import { openPdf } from './pdfjs'
import { parsePageRange } from './pdf-read'

type TWorker = import('tesseract.js').Worker

/**
 * Tesseract (Apache-2.0) with the English LSTM model. Worker, core and model are served from
 * /vendor/tesseract, so OCR never contacts a CDN. About 7 MB is downloaded on first use.
 */
async function createOcrWorker(ctx: ConvertContext, onRatio: (r: number) => void): Promise<TWorker> {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading OCR engine (~7 MB, first time only)' })
  const { createWorker, OEM } = await import('tesseract.js')
  const base = `${location.origin}${import.meta.env.BASE_URL}vendor/tesseract`
  try {
    return await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/core`,
      langPath: `${base}/lang`,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onRatio(m.progress)
      },
    })
  } catch {
    throw new ConversionError('engine-load-failed', 'The OCR engine could not start', navigator.onLine ? 'Tesseract failed to load.' : 'You are offline and the OCR engine has not been downloaded on this device yet.')
  }
}

async function recognize(worker: TWorker, canvas: HTMLCanvasElement | OffscreenCanvas): Promise<{ text: string; confidence: number }> {
  const { data } = await worker.recognize(canvas as HTMLCanvasElement)
  return { text: data.text.trim(), confidence: data.confidence }
}

function confidenceWarnings(confidences: number[]): string[] {
  const valid = confidences.filter((c) => c > 0)
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
  const w = [`OCR is approximate (average confidence ${Math.round(avg)}%). Check names, numbers and punctuation before relying on the text.`]
  if (avg < 60) w.push('Low confidence: the image may be blurry, rotated, handwritten or not in English.')
  w.push('Only English is recognised. Layout, columns and tables are not preserved.')
  return w
}

function withAbort(ctx: ConvertContext, worker: TWorker) {
  const stop = () => void worker.terminate()
  ctx.signal.addEventListener('abort', stop, { once: true })
  return () => ctx.signal.removeEventListener('abort', stop)
}

export const imageToTextOcr: ConverterFn = async (ctx) => {
  const decoded = await decodeImage(ctx.file, ctx.input.formatId ?? '', ctx.caps)
  // Tesseract works best around 300 DPI; very large photos are reduced to keep memory in check.
  const size = computeTargetSize(decoded.width, decoded.height, { resizeMode: 'fit', fitPreset: '4000' }, ctx.caps.maxCanvasPixels)
  const { canvas } = drawToCanvas(decoded, size.width, size.height, '#ffffff')
  decoded.close()
  const worker = await createOcrWorker(ctx, (r) => ctx.onProgress({ stage: 'processing', ratio: r, message: 'Recognising text' }))
  const detach = withAbort(ctx, worker)
  try {
    throwIfAborted(ctx.signal)
    ctx.onProgress({ stage: 'processing', ratio: 0, message: 'Recognising text' })
    const res = await recognize(worker, canvas)
    if (!res.text) throw new ConversionError('no-text', 'No text was recognised', 'OCR did not find any readable text in this image.', 'Try a sharper, well-lit, upright photo.')
    return {
      outputs: [{ blob: new Blob([res.text + '\n'], { type: 'text/plain;charset=utf-8' }), name: outputName(ctx.file.name, 'txt', '-ocr'), formatId: 'txt' }],
      warnings: confidenceWarnings([res.confidence]),
    }
  } catch (e) {
    if (ctx.signal.aborted) throw new CanceledError()
    throw e
  } finally {
    detach()
    releaseCanvas(canvas)
    void worker.terminate().catch(() => {})
  }
}

export const pdfToTextOcr: ConverterFn = async (ctx) => {
  const doc = await openPdf(await ctx.file.arrayBuffer())
  const pages = parsePageRange(String(ctx.options.pages ?? ''), doc.numPages)
  let current = 0
  const worker = await createOcrWorker(ctx, (r) =>
    ctx.onProgress({ stage: 'processing', ratio: (current + r) / pages.length, message: `Recognising page ${pages[current]} of ${doc.numPages}` }),
  )
  const detach = withAbort(ctx, worker)
  const chunks: string[] = []
  const confidences: number[] = []
  try {
    for (current = 0; current < pages.length; current++) {
      throwIfAborted(ctx.signal)
      const page = await doc.getPage(pages[current])
      const base = page.getViewport({ scale: 1 })
      let scale = 200 / 72
      if (base.width * base.height * scale * scale > ctx.caps.maxCanvasPixels) scale = Math.sqrt(ctx.caps.maxCanvasPixels / (base.width * base.height)) * 0.98
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      page.cleanup()
      const res = await recognize(worker, canvas)
      releaseCanvas(canvas)
      confidences.push(res.confidence)
      chunks.push(`--- Page ${pages[current]} ---\n${res.text || '(no text recognised)'}`)
    }
    if (chunks.every((c) => c.endsWith('(no text recognised)'))) {
      throw new ConversionError('no-text', 'No text was recognised', 'OCR did not find readable text on the selected pages.')
    }
    return {
      outputs: [{ blob: new Blob([chunks.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' }), name: outputName(ctx.file.name, 'txt', '-ocr'), formatId: 'txt' }],
      warnings: confidenceWarnings(confidences),
    }
  } catch (e) {
    if (ctx.signal.aborted) throw new CanceledError()
    throw e
  } finally {
    detach()
    void worker.terminate().catch(() => {})
    void doc.loadingTask.destroy()
  }
}
