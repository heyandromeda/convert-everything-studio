import { outputName } from '@/lib/files'
import type { ConverterFn } from '@/registry/types'
import { extractTitle, readText, sanitizeHtml, ensureNotEmpty } from './html'
import { htmlToPdfBlob, textToPdfBlob } from './pdf-write'
import { markdownToSafeHtml } from './text'

const pdfOut = (name: string, blob: Blob, warnings: string[]) => ({
  outputs: [{ blob, name: outputName(name, 'pdf'), formatId: 'pdf' }],
  warnings,
})

export const txtToPdf: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file, String(ctx.options.encoding ?? 'auto'))
  ensureNotEmpty(text, 'text file')
  const { blob, warnings } = await textToPdfBlob(text, ctx, ctx.baseName)
  return pdfOut(ctx.file.name, blob, warnings)
}

export const mdToPdf: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  ensureNotEmpty(text, 'document')
  const html = await markdownToSafeHtml(text)
  const { blob, warnings } = await htmlToPdfBlob(html, ctx, /^#\s+(.+)$/m.exec(text)?.[1] ?? ctx.baseName)
  return pdfOut(ctx.file.name, blob, [...warnings, 'Code blocks use the proportional body font.'])
}

export const htmlToPdf: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  const html = await sanitizeHtml(text)
  ensureNotEmpty(html.replace(/<[^>]+>/g, ''), 'document')
  const { blob, warnings } = await htmlToPdfBlob(html, ctx, extractTitle(text) ?? ctx.baseName)
  return pdfOut(ctx.file.name, blob, [...warnings, 'CSS styling, scripts and remote images are not rendered; the structure (headings, lists, tables, inline images) is re-laid out.'])
}
