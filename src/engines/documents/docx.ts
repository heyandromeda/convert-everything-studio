import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import type { ConvertContext, ConverterFn } from '@/registry/types'
import { ensureNotEmpty, htmlToPlainText, sanitizeHtml, wrapHtmlDocument } from './html'
import { htmlToPdfBlob } from './pdf-write'

type Mammoth = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>) => Promise<{ value: string; messages: { type: string; message: string }[] }>
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

async function mammoth(): Promise<Mammoth> {
  return (await import('mammoth/mammoth.browser')) as unknown as Mammoth
}

/** Word's Title/Subtitle styles are not headings by default in mammoth; map them so structure survives. */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
]

async function docxHtml(ctx: ConvertContext): Promise<{ html: string; warnings: string[] }> {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading Word reader' })
  const m = await mammoth()
  ctx.onProgress({ stage: 'processing', message: 'Reading document' })
  try {
    const res = await m.convertToHtml({ arrayBuffer: await ctx.file.arrayBuffer() }, { styleMap: STYLE_MAP })
    const html = await sanitizeHtml(res.value)
    const unrecognised = res.messages.filter((x) => x.type === 'warning').length
    const warnings = ['Converted by document structure (headings, paragraphs, lists, tables, images). Page layout, fonts, colours, headers and footers are not preserved.']
    if (unrecognised) warnings.push(`${unrecognised} formatting element${unrecognised === 1 ? ' was' : 's were'} not recognised and may look different.`)
    return { html, warnings }
  } catch {
    throw new ConversionError('corrupt', 'This Word document could not be read', 'The DOCX structure could not be parsed. It may be damaged or password-protected.')
  }
}

export const docxToHtml: ConverterFn = async (ctx) => {
  const { html, warnings } = await docxHtml(ctx)
  ensureNotEmpty(html.replace(/<[^>]+>/g, ''), 'document')
  return { outputs: [{ blob: new Blob([wrapHtmlDocument(html, ctx.baseName)], { type: 'text/html;charset=utf-8' }), name: outputName(ctx.file.name, 'html'), formatId: 'html' }], warnings }
}

export const docxToMd: ConverterFn = async (ctx) => {
  const { html, warnings } = await docxHtml(ctx)
  const [{ default: TurndownService }, { gfm }] = await Promise.all([import('turndown'), import('turndown-plugin-gfm')])
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.use(gfm)
  // Inline base64 images make Markdown unreadable; replace them with their alt text.
  td.addRule('dataImages', { filter: (n) => n.nodeName === 'IMG' && (n.getAttribute('src') ?? '').startsWith('data:'), replacement: (_c, n) => `[image${(n as HTMLElement).getAttribute('alt') ? `: ${(n as HTMLElement).getAttribute('alt')}` : ''}]` })
  const md = td.turndown(html).trim() + '\n'
  ensureNotEmpty(md, 'document')
  return { outputs: [{ blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), name: outputName(ctx.file.name, 'md'), formatId: 'md' }], warnings: [...warnings, 'Images are replaced with placeholders.'] }
}

export const docxToTxt: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading Word reader' })
  const m = await mammoth()
  let text: string
  try {
    if (ctx.options.keepStructure === false) text = (await m.extractRawText({ arrayBuffer: await ctx.file.arrayBuffer() })).value
    else text = htmlToPlainText(await sanitizeHtml((await m.convertToHtml({ arrayBuffer: await ctx.file.arrayBuffer() })).value))
  } catch {
    throw new ConversionError('corrupt', 'This Word document could not be read', 'The DOCX structure could not be parsed.')
  }
  ensureNotEmpty(text, 'document')
  return { outputs: [{ blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: outputName(ctx.file.name, 'txt'), formatId: 'txt' }], warnings: ['Only text is extracted; formatting and images are dropped.'] }
}

export const docxToPdf: ConverterFn = async (ctx) => {
  const { html, warnings } = await docxHtml(ctx)
  ensureNotEmpty(html.replace(/<[^>]+>/g, ''), 'document')
  const res = await htmlToPdfBlob(html, ctx, ctx.baseName)
  return {
    outputs: [{ blob: res.blob, name: outputName(ctx.file.name, 'pdf'), formatId: 'pdf' }],
    warnings: ['Experimental: the PDF is re-laid out from the document structure and will not match Word page-for-page.', ...warnings.slice(1), ...res.warnings],
  }
}
