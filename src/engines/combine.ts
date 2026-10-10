import { ConversionError, throwIfAborted } from '@/lib/errors'
import { safeFilename, uniqueName } from '@/lib/files'
import type { ConverterFn, SourceFile } from '@/registry/types'
import { decodeImage } from './images/decode'
import { canvasToBlob, drawToCanvas, releaseCanvas } from './images/canvas'
import { computeTargetSize } from './images/geometry'
import { addImagePage } from './images/convert'

function ordered(sources: SourceFile[] | undefined, order: unknown): SourceFile[] {
  if (!sources?.length) throw new ConversionError('unsupported-input', 'No files to combine', 'Add at least two files first.')
  return order === 'name' ? [...sources].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })) : sources
}

const stamp = () => new Date().toISOString().slice(0, 10)

export const imagesToOnePdf: ConverterFn = async (ctx) => {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const list = ordered(ctx.sources, ctx.options.order)
  const warnings: string[] = []
  for (let i = 0; i < list.length; i++) {
    throwIfAborted(ctx.signal)
    const { file, input } = list[i]
    ctx.onProgress({ stage: 'processing', ratio: i / list.length, message: `Adding ${file.name}` })
    const orientation = input.metadata.image?.orientation
    if (input.formatId === 'jpeg' && (!orientation || orientation === 1)) {
      const img = await doc.embedJpg(new Uint8Array(await file.arrayBuffer()))
      addImagePage(doc, img, img.width, img.height, String(ctx.options.pageSize ?? 'a4'))
      continue
    }
    const decoded = await decodeImage(file, input.formatId ?? '', ctx.caps)
    const size = computeTargetSize(decoded.width, decoded.height, {}, ctx.caps.maxCanvasPixels)
    if (size.limitedBy) warnings.push(`${file.name} was scaled down to fit this browser's image size limit.`)
    const { canvas } = drawToCanvas(decoded, size.width, size.height, '#ffffff')
    decoded.close()
    const photo = input.formatId === 'jpeg' || input.formatId === 'heic' || input.formatId === 'webp' || input.formatId === 'avif'
    const blob = await canvasToBlob(canvas, photo ? 'image/jpeg' : 'image/png', photo ? 0.92 : undefined)
    releaseCanvas(canvas)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const img = photo ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    addImagePage(doc, img, size.width, size.height, String(ctx.options.pageSize ?? 'a4'))
  }
  ctx.onProgress({ stage: 'finalizing', message: 'Writing PDF' })
  const bytes = await doc.save()
  return {
    outputs: [{ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: `images-${stamp()}.pdf`, formatId: 'pdf', meta: { pages: list.length } }],
    warnings: [`${list.length} images, one per page${ctx.options.order === 'name' ? ', sorted by name' : ', in the order they were added'}.`, ...warnings],
  }
}

export const mergePdfs: ConverterFn = async (ctx) => {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const list = ordered(ctx.sources, ctx.options.order)
  let pages = 0
  for (let i = 0; i < list.length; i++) {
    throwIfAborted(ctx.signal)
    ctx.onProgress({ stage: 'processing', ratio: i / list.length, message: `Adding ${list[i].file.name}` })
    let src
    try {
      src = await PDFDocument.load(await list[i].file.arrayBuffer())
    } catch {
      throw new ConversionError('corrupt', `${list[i].file.name} could not be opened`, 'It may be encrypted or damaged. Remove it from the selection and try again.')
    }
    const copied = await out.copyPages(src, src.getPageIndices())
    copied.forEach((p) => out.addPage(p))
    pages += copied.length
  }
  const bytes = await out.save()
  return {
    outputs: [{ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: `merged-${stamp()}.pdf`, formatId: 'pdf', meta: { pages } }],
    warnings: ['Pages are copied as-is, so text stays selectable. Bookmarks and form fields may not carry over.'],
  }
}

const STORED = /\.(png|jpe?g|webp|avif|gif|heic|mp4|mov|webm|mkv|mp3|m4a|aac|ogg|opus|flac|zip|gz|tgz|docx|xlsx|pptx|pdf)$/i

export const packZip: ConverterFn = async (ctx) => {
  const { zip } = await import('fflate')
  const list = ordered(ctx.sources, ctx.options.order)
  const taken = new Set<string>()
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const { file } of list) {
    throwIfAborted(ctx.signal)
    const name = uniqueName(safeFilename(file.name), taken)
    entries[name] = [new Uint8Array(await file.arrayBuffer()), { level: STORED.test(name) ? 0 : 6 }]
  }
  ctx.onProgress({ stage: 'processing', ratio: null, message: 'Compressing' })
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(entries, { consume: true }, (e, d) => (e ? reject(e) : resolve(d))))
  return {
    outputs: [{ blob: new Blob([data as BlobPart], { type: 'application/zip' }), name: `files-${stamp()}.zip`, formatId: 'zip' }],
    warnings: ['Already-compressed files (photos, video, PDFs, Office files) are stored without re-compression.'],
  }
}
