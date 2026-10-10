import { CanceledError, ConversionError } from '@/lib/errors'
import type { EncodeRequest, EncodeResponse, WorkerFormat } from './encoder-protocol'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: unknown) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../../workers/image-encoder.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev: MessageEvent<EncodeResponse>) => {
    const p = pending.get(ev.data.id)
    if (!p) return
    pending.delete(ev.data.id)
    if (ev.data.ok) p.resolve(ev.data.data)
    else p.reject(new Error(ev.data.error))
  }
  worker.onerror = (ev) => {
    const err = new ConversionError('engine-load-failed', 'The image encoder stopped unexpectedly', ev.message || 'The encoder worker crashed, often because it ran out of memory.', 'Try a smaller output size.')
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    resetWorker()
  }
  return worker
}

function resetWorker() {
  worker?.terminate()
  worker = null
}

/** Encodes RGBA pixels off the main thread. The pixel buffer is transferred, not copied. */
export function encodeInWorker(
  format: WorkerFormat,
  image: ImageData,
  opts: { quality: number; lossless?: boolean; speed?: number },
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new CanceledError())
    const id = nextId++
    const w = getWorker()
    const onAbort = () => {
      if (!pending.has(id)) return
      pending.delete(id)
      // The WASM encoders cannot be interrupted mid-call, so the worker is discarded.
      for (const p of pending.values()) p.reject(new CanceledError())
      pending.clear()
      resetWorker()
      reject(new CanceledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    pending.set(id, {
      resolve: (b) => {
        signal.removeEventListener('abort', onAbort)
        resolve(b)
      },
      reject: (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    })
    const pixels = image.data.buffer as ArrayBuffer
    const req: EncodeRequest = { id, format, pixels, width: image.width, height: image.height, ...opts }
    w.postMessage(req, [pixels])
  })
}
