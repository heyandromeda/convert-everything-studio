import { formatFromFilename, formatFromMime, getFormat, extensionOf } from '@/registry/formats'
import type { DetectedFile } from '@/registry/types'
import { readZipDirectory } from './zip-directory'

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, Math.min(b.length, start + len)))

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v)

/** Formats that may legitimately share content with another id (e.g. a .jpg labelled .jfif). */
const ALIASES: Record<string, string[]> = {
  png: ['apng'],
  apng: ['png'],
  mp4: ['mov', 'm4a', '3gp'],
  mov: ['mp4'],
  m4a: ['mp4', 'aac'],
  mkv: ['webm'],
  webm: ['mkv'],
  ogg: ['opus'],
  opus: ['ogg'],
  gz: ['tgz'],
  tgz: ['gz'],
  txt: ['md', 'csv', 'tsv', 'srt', 'vtt', 'json', 'yaml', 'xml', 'html'],
  zip: ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'numbers', 'key'],
  xml: ['svg', 'html'],
}

export function isAlias(a: string, b: string) {
  return a === b || ALIASES[a]?.includes(b) || ALIASES[b]?.includes(a)
}

/** Identify a format purely from leading bytes. Returns null when no binary signature matches. */
export function sniffSignature(b: Uint8Array): string | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return isApng(b) ? 'apng' : 'png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'gif'
  if (ascii(b, 0, 4) === 'RIFF') {
    const kind = ascii(b, 8, 4)
    if (kind === 'WEBP') return 'webp'
    if (kind === 'WAVE') return 'wav'
    if (kind === 'AVI ') return 'avi'
  }
  if (ascii(b, 0, 4) === 'FORM' && (ascii(b, 8, 4) === 'AIFF' || ascii(b, 8, 4) === 'AIFC')) return 'aiff'
  if (ascii(b, 4, 4) === 'ftyp') return sniffFtyp(b)
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return ascii(b, 0, 64).includes('webm') ? 'webm' : 'mkv'
  if (ascii(b, 0, 4) === 'fLaC') return 'flac'
  if (ascii(b, 0, 4) === 'OggS') {
    const head = ascii(b, 0, 128)
    if (head.includes('OpusHead')) return 'opus'
    return 'ogg'
  }
  if (ascii(b, 0, 3) === 'ID3') return 'mp3'
  if (b[0] === 0xff && b.length > 1 && (b[1] & 0xe0) === 0xe0) {
    const layer = (b[1] >> 1) & 3
    if ((b[1] & 0xf6) === 0xf0) return 'aac'
    if (layer === 1) return 'mp3'
  }
  if (ascii(b, 0, 1024).includes('%PDF-')) return 'pdf'
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  if (startsWith(b, [0x1f, 0x8b])) return 'gz'
  if (ascii(b, 257, 5) === 'ustar') return 'tar'
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z'
  if (ascii(b, 0, 4) === 'Rar!') return 'rar'
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'cfb'
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
  if (ascii(b, 0, 5) === '{\\rtf') return 'rtf'
  if (ascii(b, 0, 2) === 'BM' && b.length >= 30) {
    const headerSize = b[14] | (b[15] << 8)
    if ([12, 40, 52, 56, 64, 108, 124].includes(headerSize)) return 'bmp'
  }
  if (startsWith(b, [0, 0, 1, 0]) && b.length >= 22) {
    const count = b[4] | (b[5] << 8)
    if (count > 0 && count < 256 && b[9] === 0) return 'ico'
  }
  return null
}

function isApng(b: Uint8Array): boolean {
  let p = 8
  while (p + 8 <= b.length) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0
    const type = ascii(b, p + 4, 4)
    if (type === 'acTL') return true
    if (type === 'IDAT') return false
    p += 12 + len
  }
  return false
}

function sniffFtyp(b: Uint8Array): string {
  const major = ascii(b, 8, 4)
  const boxSize = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0)
  const brands = [major]
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(b, i, 4))
  if (brands.includes('avif') || brands.includes('avis')) return 'avif'
  if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(major)) return 'heic'
  if (major === 'qt  ') return 'mov'
  if (major.startsWith('M4A') || major.startsWith('M4B')) return 'm4a'
  if (major.startsWith('3g')) return '3gp'
  return 'mp4'
}

function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return true
  // UTF-16 BOM
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return true
  let control = 0
  const n = Math.min(b.length, 8192)
  for (let i = 0; i < n; i++) {
    const c = b[i]
    if (c === 0) return false
    if (c < 9 || (c > 13 && c < 32)) control++
  }
  return control / n < 0.02
}

export function sniffText(text: string): string | null {
  const t = text.replace(/^\uFEFF/, '').trimStart()
  const lower = t.slice(0, 2048).toLowerCase()
  if (lower.startsWith('{\\rtf')) return 'rtf'
  if (lower.startsWith('webvtt')) return 'vtt'
  if (/^\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(t)) return 'srt'
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) return 'html'
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(t.slice(0, 4096))) return 'svg'
  if (lower.startsWith('<?xml')) return 'xml'
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(text)
      return 'json'
    } catch {
      /* not JSON */
    }
  }
  return null
}

const OOXML_FROM_ZIP: [string, string][] = [
  ['word/', 'docx'],
  ['xl/', 'xlsx'],
  ['ppt/', 'pptx'],
]

const ODF_MIME: Record<string, string> = {
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/epub+zip': 'epub',
}

async function refineZip(file: Blob, head: Uint8Array, extId: string | undefined): Promise<string> {
  // ODF and EPUB store an uncompressed "mimetype" entry first.
  if (ascii(head, 30, 8) === 'mimetype') {
    const mime = ascii(head, 38, 60)
    for (const [m, id] of Object.entries(ODF_MIME)) if (mime.startsWith(m)) return id
  }
  const entries = await readZipDirectory(file, 2000).catch(() => null)
  if (entries) {
    const names = entries.map((e) => e.path)
    if (names.includes('[Content_Types].xml')) {
      for (const [prefix, id] of OOXML_FROM_ZIP) if (names.some((n) => n.startsWith(prefix))) return id
    }
    if (names.some((n) => n === 'Index/Document.iwa' || n.startsWith('Index/'))) {
      if (extId === 'numbers' || extId === 'key') return extId
    }
  }
  return 'zip'
}

async function refineGzip(file: Blob, extId: string | undefined): Promise<string> {
  if (extId === 'tgz') return 'tgz'
  try {
    const { Gunzip } = await import('fflate')
    const chunk = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
    let out = new Uint8Array(0)
    const g = new Gunzip((data) => {
      if (out.length < 600) {
        const merged = new Uint8Array(out.length + data.length)
        merged.set(out)
        merged.set(data, out.length)
        out = merged
      }
    })
    try {
      g.push(chunk, false)
    } catch {
      /* partial stream is fine */
    }
    if (out.length >= 262 && ascii(out, 257, 5) === 'ustar') return 'tgz'
  } catch {
    /* fall through */
  }
  return 'gz'
}

const CFB_FROM_EXT = new Set(['doc', 'xls', 'ppt'])

export async function detectFile(file: File): Promise<Omit<DetectedFile, 'metadata'>> {
  const ext = extensionOf(file.name)
  const extFmt = formatFromFilename(file.name)
  const mimeFmt = formatFromMime(file.type)
  const head = new Uint8Array(await file.slice(0, 4100).arrayBuffer())

  let actual = sniffSignature(head)
  let source: DetectedFile['source'] = 'signature'

  if (actual === 'zip') actual = await refineZip(file, head, extFmt?.id)
  else if (actual === 'gz') actual = await refineGzip(file, extFmt?.id)
  else if (actual === 'cfb') actual = extFmt && CFB_FROM_EXT.has(extFmt.id) ? extFmt.id : null
  else if (actual === 'mp4' && extFmt && ['mov', 'm4a', '3gp'].includes(extFmt.id)) actual = extFmt.id
  else if (actual === 'ogg' && extFmt?.id === 'opus') actual = 'opus'

  if (!actual && looksLikeText(head)) {
    const textHead = new TextDecoder('utf-8').decode(head)
    const sniffed = sniffText(textHead.length < file.size ? textHead : await file.text())
    const textual = extFmt && isTextualFormat(extFmt.id)
    if (textual && extFmt && (!sniffed || isAlias(extFmt.id, sniffed) || (extFmt.id === 'html' && sniffed === 'xml'))) {
      actual = extFmt.id
      source = 'extension'
    } else if (sniffed) {
      actual = sniffed
      source = 'content'
    } else if (mimeFmt && isTextualFormat(mimeFmt.id)) {
      actual = mimeFmt.id
      source = 'mime'
    } else {
      actual = 'txt'
      source = 'content'
    }
  }

  if (!actual && extFmt && !isTextualFormat(extFmt.id)) {
    // Binary content without a known signature: we cannot verify the claim.
    actual = null
    source = 'none'
  }

  const result: Omit<DetectedFile, 'metadata'> = {
    formatId: actual,
    source: actual ? source : 'none',
    extension: ext,
    mime: file.type,
  }
  const claimed = extFmt?.id
  if (actual && claimed && !isAlias(claimed, actual) && source === 'signature') {
    result.mismatch = { claimed, actual }
  }
  return result
}

const TEXTUAL = new Set(['txt', 'md', 'html', 'csv', 'tsv', 'json', 'yaml', 'xml', 'srt', 'vtt', 'svg', 'rtf'])
export function isTextualFormat(id: string) {
  return TEXTUAL.has(id)
}

export function describeDetection(d: Omit<DetectedFile, 'metadata'>): string {
  const label = getFormat(d.formatId)?.label ?? 'Unknown'
  switch (d.source) {
    case 'signature':
      return `${label} (verified from file contents)`
    case 'content':
      return `${label} (identified from contents)`
    case 'extension':
      return `${label} (text file, identified by name)`
    case 'mime':
      return `${label} (identified by type)`
    default:
      return 'Unrecognised format'
  }
}
