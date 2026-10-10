import { ConversionError } from '@/lib/errors'
import { outputName, pad, safeFilename } from '@/lib/files'
import { formatFromFilename } from '@/registry/formats'
import type { ConverterFn, OutputFile } from '@/registry/types'

async function readEntries(file: Blob, match: (name: string) => boolean, maxBytes = 200 * 1024 * 1024): Promise<Record<string, Uint8Array>> {
  const { unzip } = await import('fflate')
  const data = new Uint8Array(await file.arrayBuffer())
  let budget = maxBytes
  return new Promise((resolve, reject) =>
    unzip(
      data,
      {
        filter: (f) => {
          if (!match(f.name) || f.originalSize > budget) return false
          budget -= f.originalSize
          return true
        },
      },
      (err, out) => (err ? reject(new ConversionError('corrupt', 'This file could not be opened', 'The Office package is damaged.')) : resolve(out)),
    ),
  )
}

const decoder = new TextDecoder()
const xmlText = (b: Uint8Array) => decoder.decode(b)

function slideOrder(presentationXml: string, relsXml: string): string[] {
  const rels = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1]
    const target = /Target="([^"]+)"/.exec(m[0])?.[1]
    if (id && target) rels.set(id, target.replace(/^\/?(ppt\/)?/, 'ppt/'))
  }
  const order: string[] = []
  for (const m of presentationXml.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)) {
    const t = rels.get(m[1])
    if (t) order.push(t)
  }
  return order
}

/** Paragraph text from DrawingML: each <a:p> becomes a line, <a:t> runs are concatenated. */
export function drawingText(xml: string): string[] {
  const lines: string[] = []
  for (const p of xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    const runs = [...p[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((r) => r[1])
    const line = decodeEntities(runs.join('')).trim()
    if (line) lines.push(line)
  }
  return lines
}

function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const map: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
    if (map[e]) return map[e]
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : ''
  })
}

export const pptxToText: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'processing', message: 'Reading slides' })
  const entries = await readEntries(ctx.file, (n) => /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/.test(n), 100 * 1024 * 1024)
  const pres = entries['ppt/presentation.xml']
  const rels = entries['ppt/_rels/presentation.xml.rels']
  if (!pres || !rels) throw new ConversionError('corrupt', 'This presentation could not be read', 'The slide list is missing.')
  const order = slideOrder(xmlText(pres), xmlText(rels))
  const includeNotes = ctx.options.notes !== false
  const parts: string[] = []
  order.forEach((path, i) => {
    const slide = entries[path]
    const lines = slide ? drawingText(xmlText(slide)) : []
    let block = `--- Slide ${i + 1} ---\n${lines.join('\n') || '(no text)'}`
    if (includeNotes) {
      const relPath = path.replace('slides/', 'slides/_rels/') + '.rels'
      const relXml = entries[relPath] ? xmlText(entries[relPath]) : ''
      const notesTarget = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(relXml)?.[1]
      const notes = notesTarget && entries[`ppt/notesSlides/${notesTarget}`] ? drawingText(xmlText(entries[`ppt/notesSlides/${notesTarget}`])).filter((l) => !/^\d+$/.test(l)) : []
      if (notes.length) block += `\n\nSpeaker notes:\n${notes.join('\n')}`
    }
    parts.push(block)
  })
  return {
    outputs: [{ blob: new Blob([parts.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' }), name: outputName(ctx.file.name, 'txt'), formatId: 'txt' }],
    warnings: [`Text from ${order.length} slide${order.length === 1 ? '' : 's'} in presentation order. Layout, images, charts and SmartArt text are not included.`],
  }
}

export const pptxMedia: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'processing', message: 'Collecting media' })
  const prefix = ctx.input.formatId === 'docx' ? 'word/media/' : ctx.input.formatId === 'xlsx' ? 'xl/media/' : 'ppt/media/'
  const entries = await readEntries(ctx.file, (n) => n.startsWith(prefix) && !n.endsWith('/'))
  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!names.length) throw new ConversionError('empty-output', 'No embedded media found', 'This file contains no images, audio or video.')
  const width = String(names.length).length
  const outputs: OutputFile[] = names.map((n, i) => {
    const original = n.slice(prefix.length)
    const fmt = formatFromFilename(original)
    return {
      blob: new Blob([entries[n] as BlobPart], { type: fmt?.outputMime ?? 'application/octet-stream' }),
      name: `${safeFilename(ctx.baseName)}-media-${pad(i + 1, width)}-${safeFilename(original)}`,
      formatId: 'files',
      previewAs: fmt?.id,
    }
  })
  return { outputs, warnings: ['These are the original embedded files, exactly as stored (no re-encoding).'] }
}

/** Slide count / page count / word count from docProps/app.xml, plus slide list fallback. */
export async function officeInfo(file: Blob, formatId: string): Promise<{ slideCount?: number; pageCount?: number; wordCount?: number; title?: string }> {
  const entries = await readEntries(file, (n) => n === 'docProps/app.xml' || n === 'docProps/core.xml' || n === 'ppt/presentation.xml', 10 * 1024 * 1024)
  const app = entries['docProps/app.xml'] ? xmlText(entries['docProps/app.xml']) : ''
  const core = entries['docProps/core.xml'] ? xmlText(entries['docProps/core.xml']) : ''
  const num = (tag: string) => {
    const m = new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(app)
    return m ? Number(m[1]) : undefined
  }
  const title = /<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1] || undefined
  if (formatId === 'pptx') {
    const pres = entries['ppt/presentation.xml'] ? xmlText(entries['ppt/presentation.xml']) : ''
    const count = (pres.match(/<p:sldId\b/g) ?? []).length
    return { slideCount: count || num('Slides'), title }
  }
  return { pageCount: num('Pages'), wordCount: num('Words'), title }
}
