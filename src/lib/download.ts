import { uniqueName } from './files'

export function triggerDownload(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Opens the native share sheet (iOS: Save Image, Save to Files, AirDrop…). Must run inside a tap handler. */
export async function shareFiles(files: { blob: Blob; name: string }[]): Promise<'shared' | 'dismissed' | 'unsupported'> {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }))
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: list })) return 'unsupported'
  try {
    await navigator.share({ files: list })
    return 'shared'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'dismissed'
    return 'unsupported'
  }
}

const STORE_ONLY = /\.(png|jpe?g|webp|avif|gif|heic|mp4|mov|webm|mkv|mp3|m4a|aac|ogg|opus|flac|zip|gz|tgz|docx|xlsx|pptx|odt|ods|odp|pdf)$/i

/** Builds a ZIP of results. Already-compressed formats are stored rather than re-deflated. */
export async function buildZip(files: { blob: Blob; name: string; folder?: string }[]): Promise<Blob> {
  const { zip } = await import('fflate')
  const taken = new Set<string>()
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const f of files) {
    const path = uniqueName(f.folder ? `${f.folder}/${f.name}` : f.name, taken)
    entries[path] = [new Uint8Array(await f.blob.arrayBuffer()), { level: STORE_ONLY.test(f.name) ? 0 : 6 }]
  }
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { consume: true }, (err, out) => (err ? reject(err) : resolve(out))),
  )
  return new Blob([data as BlobPart], { type: 'application/zip' })
}
