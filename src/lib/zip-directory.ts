import type { ArchiveEntry } from '@/registry/types'
import { sanitizeArchivePath } from './archive-safety'

export interface ZipDirectoryEntry extends ArchiveEntry {
  localHeaderOffset: number
  method: number
  encrypted: boolean
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

/**
 * Reads a ZIP central directory without decompressing anything.
 * Only the tail of the file and the directory itself are read.
 */
export async function readZipDirectory(blob: Blob, maxEntries = 20000): Promise<ZipDirectoryEntry[] | null> {
  const tailSize = Math.min(blob.size, 65557)
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer())
  const view = new DataView(tail.buffer)
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  let count = view.getUint16(eocd + 10, true)
  let size = view.getUint32(eocd + 12, true)
  let offset = view.getUint32(eocd + 16, true)

  // ZIP64: locate the zip64 end-of-central-directory record
  if (offset === 0xffffffff || count === 0xffff || size === 0xffffffff) {
    const locator = eocd - 20
    if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
      const z64Offset = Number(view.getBigUint64(locator + 8, true))
      const rec = new DataView(await blob.slice(z64Offset, z64Offset + 56).arrayBuffer())
      if (rec.getUint32(0, true) === 0x06064b50) {
        count = Number(rec.getBigUint64(32, true))
        size = Number(rec.getBigUint64(40, true))
        offset = Number(rec.getBigUint64(48, true))
      }
    }
  }
  if (offset + size > blob.size || size > 64 * 1024 * 1024) return null
  const dir = new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer())
  const dv = new DataView(dir.buffer)
  const entries: ZipDirectoryEntry[] = []
  const utf8 = new TextDecoder('utf-8')
  const cp437 = new TextDecoder('ibm866') // close enough for legacy DOS names; exact CP437 is not in TextDecoder
  let p = 0
  for (let i = 0; i < count && p + 46 <= dir.length && entries.length < maxEntries; i++) {
    if (dv.getUint32(p, true) !== CEN_SIG) break
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    let compressedSize = dv.getUint32(p + 20, true)
    let uncompressedSize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    let localHeaderOffset = dv.getUint32(p + 42, true)
    const nameBytes = dir.subarray(p + 46, p + 46 + nameLen)
    const name = flags & 0x800 ? utf8.decode(nameBytes) : decodeLegacyName(nameBytes, utf8, cp437)
    // ZIP64 extra field
    let e = p + 46 + nameLen
    const extraEnd = e + extraLen
    while (e + 4 <= extraEnd) {
      const id = dv.getUint16(e, true)
      const len = dv.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(dv.getBigUint64(q, true)); q += 8 }
        if (compressedSize === 0xffffffff) { compressedSize = Number(dv.getBigUint64(q, true)); q += 8 }
        if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(dv.getBigUint64(q, true)) }
      }
      e += 4 + len
    }
    const isDirectory = name.endsWith('/')
    const safe = sanitizeArchivePath(name)
    entries.push({
      path: safe.path || name,
      size: uncompressedSize,
      compressedSize,
      isDirectory,
      unsafe: safe.problem,
      localHeaderOffset,
      method,
      encrypted: (flags & 1) === 1,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function decodeLegacyName(bytes: Uint8Array, utf8: TextDecoder, fallback: TextDecoder): string {
  // Many tools write UTF-8 without setting the flag; prefer it when it decodes cleanly.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return fallback.decode(bytes)
    } catch {
      return utf8.decode(bytes)
    }
  }
}
