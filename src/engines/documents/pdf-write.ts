import { ConversionError, throwIfAborted } from '@/lib/errors'
import type { ConvertContext } from '@/registry/types'

type PdfMakeStatic = {
  addVirtualFileSystem: (vfs: Record<string, string>) => void
  createPdf: (dd: unknown) => { getBlob: () => Promise<Blob> }
}

let pdfMakePromise: Promise<PdfMakeStatic> | null = null

async function loadPdfMake(): Promise<PdfMakeStatic> {
  pdfMakePromise ??= (async () => {
    const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
      import('pdfmake/build/pdfmake') as Promise<{ default: PdfMakeStatic }>,
      import('pdfmake/build/vfs_fonts') as unknown as Promise<{ default: Record<string, string> }>,
    ])
    pdfMake.addVirtualFileSystem(vfs)
    return pdfMake
  })()
  return pdfMakePromise
}

export const PAGE_SIZES: Record<string, { label: string; width: number }> = {
  A4: { label: 'A4', width: 595.28 },
  LETTER: { label: 'US Letter', width: 612 },
}

/** Scripts outside the embedded Roboto font's coverage (Latin, Greek, Cyrillic). */
const UNCOVERED = /[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0fff\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]|[\u{1f300}-\u{1faff}]/u

export function coverageWarnings(text: string): string[] {
  return UNCOVERED.test(text)
    ? ['Some characters (for example Chinese, Japanese, Korean, Arabic, Hebrew, Indic scripts or emoji) are not covered by the embedded font and will be missing from the PDF.']
    : []
}

async function rasterizeDataUri(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth || 1
      c.height = img.naturalHeight || 1
      c.getContext('2d')!.drawImage(img, 0, 0)
      resolve(c.toDataURL('image/png'))
      c.width = 0
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** pdfmake only understands PNG and JPEG; other inline images are converted to PNG first. */
async function normalizeImages(html: string): Promise<{ html: string; dropped: number }> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  let dropped = 0
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    if (/^data:image\/(png|jpe?g);/i.test(src)) continue
    const png = src.startsWith('data:image/') ? await rasterizeDataUri(src) : null
    if (png) img.setAttribute('src', png)
    else {
      img.remove()
      dropped++
    }
  }
  return { html: doc.body.innerHTML, dropped }
}

function constrainImages(node: unknown, maxW: number) {
  if (Array.isArray(node)) return node.forEach((n) => constrainImages(n, maxW))
  if (!node || typeof node !== 'object') return
  const n = node as Record<string, unknown>
  if (typeof n.image === 'string') {
    delete n.width
    delete n.height
    n.fit = [maxW, 700]
  }
  for (const k of ['stack', 'columns', 'ul', 'ol', 'text', 'table', 'body']) if (n[k]) constrainImages(n[k], maxW)
}

const STYLES = {
  'html-h1': { fontSize: 22, bold: true, marginBottom: 8, marginTop: 14 },
  'html-h2': { fontSize: 18, bold: true, marginBottom: 6, marginTop: 12 },
  'html-h3': { fontSize: 15, bold: true, marginBottom: 4, marginTop: 10 },
  'html-h4': { fontSize: 13, bold: true, marginBottom: 4, marginTop: 8 },
  'html-p': { marginBottom: 6 },
  'html-pre': { fontSize: 9, background: '#f3f4f6', preserveLeadingSpaces: true },
  'html-code': { fontSize: 9, background: '#f3f4f6' },
  'html-blockquote': { italics: true, color: '#555555', marginLeft: 12 },
  'html-th': { bold: true, fillColor: '#eeeeee' },
}

function docDefinition(content: unknown, ctx: ConvertContext, title: string) {
  const size = String(ctx.options.pageSize ?? 'A4')
  return {
    info: { title, creator: 'Convert Everything', producer: 'Convert Everything (pdfmake)' },
    pageSize: size,
    pageMargins: [48, 56, 48, 56],
    defaultStyle: { font: 'Roboto', fontSize: Number(ctx.options.fontSize ?? 11), lineHeight: 1.25 },
    styles: STYLES,
    content,
    footer: ctx.options.pageNumbers === false ? undefined : (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: 'center', fontSize: 8, color: '#888888', margin: [0, 20, 0, 0] }),
  }
}

export async function htmlToPdfBlob(html: string, ctx: ConvertContext, title: string): Promise<{ blob: Blob; warnings: string[] }> {
  const warnings = coverageWarnings(html.replace(/<[^>]+>/g, ''))
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading PDF engine' })
  const [pdfMake, { default: htmlToPdfmake }] = await Promise.all([loadPdfMake(), import('html-to-pdfmake')])
  throwIfAborted(ctx.signal)
  ctx.onProgress({ stage: 'processing', message: 'Laying out pages' })
  const { html: normalized, dropped } = await normalizeImages(html)
  if (dropped) warnings.push(`${dropped} image${dropped === 1 ? '' : 's'} could not be embedded and ${dropped === 1 ? 'was' : 'were'} left out.`)
  const content = htmlToPdfmake(normalized, { tableAutoSize: true, removeExtraBlanks: true })
  const pageW = PAGE_SIZES[String(ctx.options.pageSize ?? 'A4')]?.width ?? 595
  constrainImages(content, pageW - 96)
  try {
    const blob = await pdfMake.createPdf(docDefinition(content, ctx, title)).getBlob()
    return { blob, warnings }
  } catch (e) {
    throw new ConversionError('unknown', 'The PDF could not be laid out', e instanceof Error ? e.message.slice(0, 160) : 'pdfmake failed.', 'Very complex tables or nested layouts can fail; try exporting to HTML instead.')
  }
}

export async function textToPdfBlob(text: string, ctx: ConvertContext, title: string): Promise<{ blob: Blob; warnings: string[] }> {
  const warnings = coverageWarnings(text)
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading PDF engine' })
  const pdfMake = await loadPdfMake()
  throwIfAborted(ctx.signal)
  ctx.onProgress({ stage: 'processing', message: 'Laying out pages' })
  const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map((line) => ({ text: line || ' ', preserveLeadingSpaces: true }))
  const blob = await pdfMake.createPdf(docDefinition(paragraphs, ctx, title)).getBlob()
  return { blob, warnings }
}
