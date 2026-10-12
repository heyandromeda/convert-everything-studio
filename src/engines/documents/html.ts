import { ConversionError } from '@/lib/errors'

/** Decodes text, honouring a BOM and falling back to Windows-1252 when the bytes are not valid UTF-8. */
export function decodeText(bytes: Uint8Array, encoding = 'auto'): { text: string; encoding: string } {
  if (encoding !== 'auto') return { text: new TextDecoder(encoding).decode(bytes), encoding }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }
  }
}

export async function readText(file: Blob, encoding = 'auto') {
  return decodeText(new Uint8Array(await file.arrayBuffer()), encoding)
}

const REMOTE_ATTRS = new Set(['src', 'poster', 'background', 'href', 'xlink:href', 'data', 'action', 'formaction', 'ping', 'longdesc', 'lowsrc', 'dynsrc'])

/** Sanitises untrusted HTML: no scripts, handlers, forms, frames, or remote resources. */
export async function sanitizeHtml(html: string): Promise<string> {
  const DOMPurify = (await import('dompurify')).default
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOW_DATA_ATTR: false,
  })
  // Remote images would leak the user's IP to third parties; only inline images are kept.
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html')
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('data:image/')) img.replaceWith(doc.createTextNode(img.getAttribute('alt') ? `[${img.getAttribute('alt')}]` : ''))
  }
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:|#)/i.test(href)) a.removeAttribute('href')
  }
  // Media, posters, table backgrounds and SVG <image>/<use> load as soon as the saved file is opened.
  // Only inline data and same-document fragments are kept.
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      // Link targets were vetted above and are only fetched when clicked.
      if (!REMOTE_ATTRS.has(name) || (el.localName === 'a' && name === 'href')) continue
      const v = attr.value.trim()
      if (!v.startsWith('data:') && !v.startsWith('#')) el.removeAttribute(attr.name)
    }
  }
  return doc.body.innerHTML
}

export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m?.[1].trim() || undefined
}

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'TABLE', 'UL', 'OL', 'HR', 'FIGURE'])

/** Plain text from sanitised HTML, keeping paragraph and list structure. */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out: string[] = []
  const walk = (node: Node, listDepth: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push((node.textContent ?? '').replace(/\s+/g, ' '))
      return
    }
    if (!(node instanceof Element)) return
    const tag = node.tagName
    if (tag === 'BR') return void out.push('\n')
    if (tag === 'PRE') {
      out.push('\n' + (node.textContent ?? '') + '\n')
      return
    }
    if (tag === 'LI') out.push('\n' + '  '.repeat(Math.max(0, listDepth - 1)) + '• ')
    else if (BLOCK.has(tag)) out.push('\n')
    if (tag === 'TD' || tag === 'TH') out.push('\t')
    const nextDepth = tag === 'UL' || tag === 'OL' ? listDepth + 1 : listDepth
    node.childNodes.forEach((c) => walk(c, nextDepth))
    if (BLOCK.has(tag) && tag !== 'LI') out.push('\n')
  }
  doc.body.childNodes.forEach((n) => walk(n, 0))
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/^ +/, (m) => (m.length > 1 ? m : '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const DOC_CSS = `
:root{color-scheme:light dark}
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1.25rem;color:#1d1f24;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6e7ea;background:#15171b}a{color:#7cc7ff}code,pre{background:#22252b!important}th,td{border-color:#3a3d44!important}}
h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .5em}
pre{padding:.9rem 1rem;overflow:auto;border-radius:8px;background:#f4f5f7}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4f5f7;padding:.1em .3em;border-radius:4px}
pre code{padding:0;background:none}
table{border-collapse:collapse;margin:1rem 0;display:block;overflow-x:auto}
th,td{border:1px solid #d6d8dc;padding:.4rem .7rem;text-align:left}
img{max-width:100%;height:auto}
blockquote{margin:1rem 0;padding:.2rem 1rem;border-left:4px solid #c9ccd1;color:#5b5f66}
`.trim()

export function wrapHtmlDocument(body: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOC_CSS}</style>
</head>
<body>
${body}
</body>
</html>
`
}

export function ensureNotEmpty(text: string, what: string) {
  if (!text.trim()) throw new ConversionError('empty-output', `The ${what} is empty`, `No text content was found in this ${what}.`)
}
