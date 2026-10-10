import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import type { ConverterFn } from '@/registry/types'
import { parsePageRange } from './pdf-read'

async function loadPdfLib(file: Blob) {
  const { PDFDocument } = await import('pdf-lib')
  try {
    return { PDFDocument, src: await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/encrypt/i.test(msg)) {
      throw new ConversionError('encrypted', 'This PDF is encrypted', 'Pages cannot be extracted from an encrypted PDF.', 'Remove the password in the app that created it.')
    }
    throw new ConversionError('corrupt', 'This PDF could not be opened', 'The file structure could not be parsed.')
  }
}

/** Copies selected pages into a new PDF without re-rendering (text stays selectable). */
export const pdfExtractPages: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading PDF tools' })
  const { PDFDocument, src } = await loadPdfLib(ctx.file)
  const pages = parsePageRange(String(ctx.options.pages ?? ''), src.getPageCount())
  ctx.onProgress({ stage: 'processing', message: `Copying ${pages.length} page${pages.length === 1 ? '' : 's'}` })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pages.map((p) => p - 1))
  copied.forEach((p) => out.addPage(p))
  out.setProducer('Convert Everything (pdf-lib)')
  const bytes = await out.save()
  return {
    outputs: [{ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: outputName(ctx.file.name, 'pdf', `-pages-${String(ctx.options.pages || 'all').replace(/[^\d,-]/g, '').slice(0, 24)}`), formatId: 'pdf', meta: { pages: pages.length } }],
    warnings: ['Bookmarks, form fields and links that point outside the selected pages may not carry over.'],
  }
}

/** Removes document info metadata (author, title, producer, dates) and XMP. */
export const pdfStripMetadata: ConverterFn = async (ctx) => {
  const { src } = await loadPdfLib(ctx.file)
  const { PDFName } = await import('pdf-lib')
  src.setTitle('')
  src.setAuthor('')
  src.setSubject('')
  src.setKeywords([])
  src.setCreator('')
  src.setProducer('')
  src.catalog.delete(PDFName.of('Metadata'))
  const bytes = await src.save({ updateFieldAppearances: false })
  return {
    outputs: [{ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: outputName(ctx.file.name, 'pdf', '-clean'), formatId: 'pdf', meta: { pages: src.getPageCount() } }],
    warnings: ['Removed the document title, author, subject, keywords, creator, producer and XMP metadata. Metadata embedded inside images or attachments is not changed.'],
  }
}
