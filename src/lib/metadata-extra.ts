import type { FileMetadata } from '@/registry/types'
import { getCapabilities } from './capabilities'

const MB = 1024 * 1024

/** Metadata for document, spreadsheet and archive formats. Heavy parsers load on demand. */
export async function inspectExtra(file: File, fmt: string): Promise<FileMetadata> {
  const caps = getCapabilities()
  switch (fmt) {
    case 'pdf': {
      if (file.size > (caps.isMobile ? 150 : 500) * MB) return {}
      const { pdfInfo } = await import('@/engines/documents/pdf-read')
      const info = await pdfInfo(file)
      return {
        document: { pageCount: info.pageCount, title: info.title, hasText: info.hasText },
        notes: info.hasText === false ? ['The first page has no selectable text — this PDF may be scanned. Text extraction would need OCR.'] : undefined,
      }
    }
    case 'docx':
    case 'pptx': {
      const { officeInfo } = await import('@/engines/presentations/pptx')
      const info = await officeInfo(file, fmt)
      return { document: { pageCount: info.pageCount, slideCount: info.slideCount, wordCount: info.wordCount, title: info.title } }
    }
    case 'xlsx':
    case 'xls':
    case 'ods': {
      if (file.size > 80 * MB) return {}
      const { workbookInfo } = await import('@/engines/spreadsheets/sheets')
      const info = await workbookInfo(file)
      return { sheet: { sheetNames: info.sheetNames } }
    }
    case 'csv':
    case 'tsv': {
      if (file.size > 30 * MB) return {}
      const text = await file.text()
      let rows = 0
      let inQuotes = false
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 34) inQuotes = !inQuotes
        else if (c === 10 && !inQuotes) rows++
      }
      if (text.length && text.charCodeAt(text.length - 1) !== 10) rows++
      return { sheet: { rowCount: rows } }
    }
    case 'zip':
    case 'tar':
    case 'tgz': {
      const { archiveListing } = await import('@/engines/archives/archives')
      const entries = await archiveListing(file, fmt, caps.isMobile)
      if (!entries) return {}
      const files = entries.filter((e) => !e.isDirectory)
      return {
        archive: {
          entryCount: files.length,
          totalSize: files.reduce((s, e) => s + e.size, 0),
          entries: entries.slice(0, 2000).map((e) => ({ path: e.path, size: e.size, compressedSize: e.compressedSize, isDirectory: e.isDirectory, unsafe: e.unsafe })),
          truncated: entries.length > 2000,
        },
        notes: entries.some((e) => e.unsafe) ? ['Some entries have unsafe paths (for example "../"). They will be extracted with safe names.'] : undefined,
      }
    }
    case '7z':
    case 'rar': {
      if (file.size > (caps.isMobile ? 300 : 1500) * MB) return {}
      const { listLibarchive } = await import('@/engines/archives/libarchive')
      const entries = await listLibarchive(file)
      return {
        archive: { entryCount: entries.length, totalSize: entries.reduce((s, e) => s + e.size, 0), entries: entries.slice(0, 2000), truncated: entries.length > 2000 },
        notes: entries.some((e) => e.unsafe) ? ['Some entries have unsafe paths (for example "../"). They will be extracted with safe names.'] : undefined,
      }
    }
    default:
      return {}
  }
}
