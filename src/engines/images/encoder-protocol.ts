export type WorkerFormat = 'webp' | 'avif' | 'gif' | 'tiff'

export interface EncodeRequest {
  id: number
  format: WorkerFormat
  pixels: ArrayBuffer
  width: number
  height: number
  quality: number
  lossless?: boolean
  speed?: number
}

export type EncodeResponse = { id: number; ok: true; data: ArrayBuffer } | { id: number; ok: false; error: string }
