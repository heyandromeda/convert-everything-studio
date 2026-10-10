import { ConversionError, throwIfAborted } from '@/lib/errors'
import { outputName, pad, safeFilename } from '@/lib/files'
import type { ConverterFn, OutputFile } from '@/registry/types'
import { openPdf } from './pdfjs'

/** Parses "1-3, 5, 8-" into sorted unique 1-based page numbers within [1, max]. */
export function parsePageRange(input: string, max: number): number[] {
  const s = input.trim()
  if (!s || s.toLowerCase() === 'all') return Array.from({ length: max }, (_, i) => i + 1)
  const pages = new Set<number>()
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part)
    if (m) {
      const a = m[1] ? Number(m[1]) : 1
      const b = m[2] ? Number(m[2]) : max
      for (let i = Math.max(1, a); i <= Math.min(max, b); i++) pages.add(i)
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n >= 1 && n <= max) pages.add(n)
    } else {
      throw new ConversionError('invalid-options', 'The page range is not valid', `"${part.slice(0, 20)}" is not a page number or range. Use a format like 1-3, 5.`)
    }
  }
  if (!pages.size) throw new ConversionError('invalid-options', 'No pages selected', `This PDF has ${max} page${max === 1 ? '' : 's'}; the range selected none of them.`)
  return [...pages].sort((a, b) => a - b)
}

async function load(file: Blob) {
  try {
    return await openPdf(await file.arrayBuffer())
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') {
      throw new ConversionError('encrypted', 'This PDF is password-protected', 'Encrypted PDFs cannot be opened without the password.', 'Remove the password in the app that created it, then try again.')
    }
    throw new ConversionError('corrupt', 'This PDF could not be opened', 'The file structure could not be parsed; it may be damaged.')
  }
}

interface TextItemLike {
  str: string
  hasEOL?: boolean
  transform?: number[]
}

export const pdfToText: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading PDF engine' })
  const doc = await load(ctx.file)
  try {
    const pages = parsePageRange(String(ctx.options.pages ?? ''), doc.numPages)
    const chunks: string[] = []
    let emptyPages = 0
    for (let idx = 0; idx < pages.length; idx++) {
      throwIfAborted(ctx.signal)
      ctx.onProgress({ stage: 'processing', ratio: idx / pages.length, message: `Reading page ${pages[idx]} of ${doc.numPages}` })
      const page = await doc.getPage(pages[idx])
      const content = await page.getTextContent()
      let lastY: number | null = null
      let line = ''
      const lines: string[] = []
      for (const raw of content.items as TextItemLike[]) {
        if (typeof raw.str !== 'string') continue
        const y = raw.transform?.[5] ?? null
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) {
          lines.push(line)
          line = ''
        }
        line += raw.str
        if (raw.hasEOL) {
          lines.push(line)
          line = ''
        }
        lastY = y
      }
      if (line) lines.push(line)
      const text = lines.map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      if (!text) emptyPages++
      chunks.push(ctx.options.pageMarkers === false ? text : `--- Page ${pages[idx]} ---\n${text}`)
      page.cleanup()
    }
    if (emptyPages === pages.length) {
      throw new ConversionError(
        'no-text',
        'This PDF has no selectable text',
        'It appears to be scanned or made of images, so its text can only be read with OCR (optical character recognition).',
        'Choose “Text via OCR (scanned PDFs)” as the output instead.',
      )
    }
    const warnings = emptyPages ? [`${emptyPages} page${emptyPages === 1 ? ' has' : 's have'} no selectable text (likely scanned images). Use “Text via OCR” for those pages.`] : []
    warnings.push('Only the text is extracted. Layout, fonts, tables and images are not preserved.')
    return {
      outputs: [{ blob: new Blob([chunks.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' }), name: outputName(ctx.file.name, 'txt'), formatId: 'txt' }],
      warnings,
    }
  } finally {
    void doc.loadingTask.destroy()
  }
}

export const pdfToImages = (formatId: 'png' | 'jpeg'): ConverterFn => async (ctx) => {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading PDF engine' })
  const doc = await load(ctx.file)
  const outputs: OutputFile[] = []
  const warnings: string[] = []
  try {
    const pages = parsePageRange(String(ctx.options.pages ?? ''), doc.numPages)
    const dpi = Number(ctx.options.dpi ?? 150)
    const width = String(doc.numPages).length
    for (let idx = 0; idx < pages.length; idx++) {
      throwIfAborted(ctx.signal)
      const n = pages[idx]
      ctx.onProgress({ stage: 'processing', ratio: idx / pages.length, message: `Rendering page ${n} of ${doc.numPages}` })
      const page = await doc.getPage(n)
      let scale = dpi / 72
      const base = page.getViewport({ scale: 1 })
      const max = ctx.caps.maxCanvasPixels
      if (base.width * base.height * scale * scale > max) {
        scale = Math.sqrt(max / (base.width * base.height)) * 0.98
        if (!warnings.length) warnings.push(`Some pages were rendered below ${dpi} DPI to stay within this browser's image size limit.`)
      }
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const c2d = canvas.getContext('2d')!
      c2d.fillStyle = '#ffffff'
      c2d.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, formatId === 'png' ? 'image/png' : 'image/jpeg', 0.9))
      const meta = { width: canvas.width, height: canvas.height }
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      if (!blob) throw new ConversionError('out-of-memory', 'A page could not be rendered', `Page ${n} could not be encoded, usually due to memory limits.`, 'Lower the resolution (DPI).')
      outputs.push({ blob, name: `${safeFilename(ctx.baseName)}-page-${pad(n, width)}.${formatId === 'png' ? 'png' : 'jpg'}`, formatId, meta })
    }
    warnings.push('Pages are rendered as pictures; the text in them is not selectable or editable.')
    return { outputs, warnings }
  } finally {
    void doc.loadingTask.destroy()
  }
}

/** Page count without rendering, for metadata. */
export async function pdfInfo(file: Blob): Promise<{ pageCount: number; title?: string; hasText?: boolean }> {
  const doc = await openPdf(await file.arrayBuffer())
  try {
    const meta = await doc.getMetadata().catch(() => null)
    const first = await doc.getPage(1)
    const text = await first.getTextContent()
    const hasText = (text.items as TextItemLike[]).some((i) => typeof i.str === 'string' && i.str.trim().length > 0)
    return { pageCount: doc.numPages, title: (meta?.info as { Title?: string } | undefined)?.Title || undefined, hasText }
  } finally {
    void doc.loadingTask.destroy()
  }
}
