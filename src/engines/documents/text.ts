import { outputName } from '@/lib/files'
import { mimeFor } from '@/registry/formats'
import type { ConvertContext, ConvertResult, ConverterFn } from '@/registry/types'
import { ensureNotEmpty, escapeHtml, extractTitle, htmlToPlainText, readText, sanitizeHtml, wrapHtmlDocument } from './html'

const out = (ctx: ConvertContext, text: string, formatId: string, warnings: string[] = []): ConvertResult => ({
  outputs: [{ blob: new Blob([text], { type: `${mimeFor(formatId)};charset=utf-8` }), name: outputName(ctx.file.name, formatId), formatId }],
  warnings,
})

export async function markdownToSafeHtml(md: string): Promise<string> {
  const { marked } = await import('marked')
  const raw = await marked.parse(md, { gfm: true, breaks: false })
  return sanitizeHtml(raw)
}

export const mdToHtml: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  ensureNotEmpty(text, 'document')
  const body = await markdownToSafeHtml(text)
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? ctx.baseName
  const warnings = /<script|on\w+=/i.test(text) ? ['Embedded scripts and event handlers were removed for safety.'] : []
  return out(ctx, ctx.options.standalone === false ? body : wrapHtmlDocument(body, title), 'html', warnings)
}

export const htmlToMd: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  const clean = await sanitizeHtml(text)
  const [{ default: TurndownService }, { gfm }] = await Promise.all([import('turndown'), import('turndown-plugin-gfm')])
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.use(gfm)
  const md = td.turndown(clean).trim() + '\n'
  ensureNotEmpty(md, 'document')
  return out(ctx, md, 'md', ['Layout, colours and fonts are not part of Markdown and were dropped.'])
}

export const htmlToTxt: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  const txt = htmlToPlainText(await sanitizeHtml(text))
  ensureNotEmpty(txt, 'document')
  return out(ctx, txt, 'txt')
}

export const mdToTxt: ConverterFn = async (ctx) => {
  const { text } = await readText(ctx.file)
  const txt = htmlToPlainText(await markdownToSafeHtml(text))
  ensureNotEmpty(txt, 'document')
  return out(ctx, txt, 'txt')
}

export const txtToHtml: ConverterFn = async (ctx) => {
  const { text, encoding } = await readText(ctx.file, String(ctx.options.encoding ?? 'auto'))
  const body = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  return out(ctx, wrapHtmlDocument(body, ctx.baseName), 'html', encoding !== 'utf-8' ? [`Read as ${encoding}; saved as UTF-8.`] : [])
}

export const txtReencode: ConverterFn = async (ctx) => {
  const fmt = ctx.input.formatId ?? 'txt'
  const { text, encoding } = await readText(ctx.file, String(ctx.options.encoding ?? 'auto'))
  const normalized = ctx.options.lineEndings === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : ctx.options.lineEndings === 'lf' ? text.replace(/\r\n?/g, '\n') : text
  const bom = ctx.options.bom === true ? '\uFEFF' : ''
  return {
    outputs: [{ blob: new Blob([bom + normalized.replace(/^\uFEFF/, '')], { type: `${mimeFor(fmt)};charset=utf-8` }), name: outputName(ctx.file.name, fmt, '-utf8'), formatId: fmt }],
    warnings: [`Read as ${encoding}, written as UTF-8.`],
  }
}

export { extractTitle }
