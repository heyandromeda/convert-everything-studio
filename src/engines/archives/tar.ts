import { sanitizeArchivePath } from '@/lib/archive-safety'
import type { ArchiveEntry } from '@/registry/types'

export interface TarEntry extends ArchiveEntry {
  offset: number
  type: string
}

function str(b: Uint8Array, start: number, len: number): string {
  let end = start
  while (end < start + len && b[end] !== 0) end++
  return new TextDecoder().decode(b.subarray(start, end))
}

function octal(b: Uint8Array, start: number, len: number): number {
  // GNU base-256 encoding for large sizes
  if (b[start] & 0x80) {
    let n = 0
    for (let i = start + 1; i < start + len; i++) n = n * 256 + b[i]
    return n
  }
  const s = str(b, start, len).trim()
  return s ? parseInt(s, 8) : 0
}

function parsePax(data: Uint8Array): Record<string, string> {
  const text = new TextDecoder().decode(data)
  const out: Record<string, string> = {}
  let p = 0
  while (p < text.length) {
    const sp = text.indexOf(' ', p)
    if (sp < 0) break
    const len = Number(text.slice(p, sp))
    if (!len) break
    const rec = text.slice(sp + 1, p + len - 1)
    const eq = rec.indexOf('=')
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1)
    p += len
  }
  return out
}

/** Lists a POSIX/GNU/PAX tar archive held in memory. File data is not copied. */
export function listTar(b: Uint8Array, maxEntries = 20000): TarEntry[] {
  const entries: TarEntry[] = []
  let p = 0
  let longName: string | null = null
  let pax: Record<string, string> = {}
  while (p + 512 <= b.length && entries.length < maxEntries) {
    if (b.subarray(p, p + 512).every((x) => x === 0)) break
    const name = str(b, p, 100)
    const size = octal(b, p + 124, 12)
    const type = String.fromCharCode(b[p + 156] || 48)
    const prefix = str(b, p + 257, 6) === 'ustar' ? str(b, p + 345, 155) : ''
    const dataStart = p + 512
    const next = dataStart + Math.ceil(size / 512) * 512
    if (type === 'L') {
      longName = str(b, dataStart, size)
    } else if (type === 'x') {
      pax = parsePax(b.subarray(dataStart, dataStart + size))
    } else if (type === 'g') {
      /* global header: ignored */
    } else {
      const full = pax.path ?? longName ?? (prefix ? `${prefix}/${name}` : name)
      const realSize = pax.size ? Number(pax.size) : size
      const isDirectory = type === '5' || full.endsWith('/')
      const safe = sanitizeArchivePath(full)
      // Symlinks and hard links are listed but never followed or extracted.
      const unsafe = type === '1' || type === '2' ? 'Link (not extracted)' : safe.problem
      if (type === '0' || type === '\0' || type === '5' || type === '1' || type === '2' || type === '7') {
        entries.push({ path: safe.path || full, size: isDirectory ? 0 : realSize, isDirectory, unsafe, offset: dataStart, type })
      }
      longName = null
      pax = {}
    }
    p = next
  }
  return entries
}
