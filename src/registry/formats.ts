import type { Category, FormatDef } from './types'

const f = (
  id: string,
  label: string,
  category: Category,
  extensions: string[],
  mimeTypes: string[],
  description?: string,
): FormatDef => ({ id, label, category, extensions, mimeTypes, outputMime: mimeTypes[0] ?? 'application/octet-stream', description })

export const FORMATS: FormatDef[] = [
  // Images
  f('png', 'PNG', 'image', ['png'], ['image/png'], 'Lossless raster image with transparency'),
  f('apng', 'APNG', 'image', ['apng'], ['image/apng'], 'Animated PNG'),
  f('jpeg', 'JPEG', 'image', ['jpg', 'jpeg', 'jpe', 'jfif'], ['image/jpeg'], 'Lossy photo format, no transparency'),
  f('webp', 'WebP', 'image', ['webp'], ['image/webp'], 'Modern lossy/lossless format with transparency'),
  f('avif', 'AVIF', 'image', ['avif'], ['image/avif'], 'AV1-based image format, very small files'),
  f('gif', 'GIF', 'image', ['gif'], ['image/gif'], '256-colour image, supports animation'),
  f('bmp', 'BMP', 'image', ['bmp', 'dib'], ['image/bmp'], 'Uncompressed Windows bitmap'),
  f('tiff', 'TIFF', 'image', ['tif', 'tiff'], ['image/tiff'], 'Tagged image file'),
  f('ico', 'ICO', 'image', ['ico'], ['image/x-icon', 'image/vnd.microsoft.icon'], 'Windows / favicon icon'),
  f('heic', 'HEIC', 'image', ['heic', 'heif', 'hif'], ['image/heic', 'image/heif'], 'Apple High Efficiency image'),
  f('svg', 'SVG', 'image', ['svg'], ['image/svg+xml'], 'Vector graphic'),

  // Video
  f('mp4', 'MP4', 'video', ['mp4', 'm4v'], ['video/mp4'], 'MPEG-4 container'),
  f('mov', 'MOV', 'video', ['mov', 'qt'], ['video/quicktime'], 'QuickTime container'),
  f('webm', 'WebM', 'video', ['webm'], ['video/webm'], 'WebM container (VP8/VP9 + Opus/Vorbis)'),
  f('mkv', 'MKV', 'video', ['mkv'], ['video/x-matroska'], 'Matroska container'),
  f('avi', 'AVI', 'video', ['avi'], ['video/x-msvideo'], 'Audio Video Interleave'),
  f('3gp', '3GP', 'video', ['3gp', '3g2'], ['video/3gpp']),

  // Audio
  f('mp3', 'MP3', 'audio', ['mp3'], ['audio/mpeg'], 'MPEG-1 Layer III'),
  f('wav', 'WAV', 'audio', ['wav', 'wave'], ['audio/wav', 'audio/x-wav', 'audio/wave'], 'Uncompressed PCM audio'),
  f('aac', 'AAC', 'audio', ['aac'], ['audio/aac'], 'Raw AAC (ADTS)'),
  f('m4a', 'M4A', 'audio', ['m4a'], ['audio/mp4', 'audio/x-m4a'], 'AAC audio in an MPEG-4 container'),
  f('ogg', 'OGG', 'audio', ['ogg', 'oga'], ['audio/ogg'], 'Ogg Vorbis'),
  f('opus', 'Opus', 'audio', ['opus'], ['audio/opus', 'audio/ogg'], 'Opus in an Ogg container'),
  f('flac', 'FLAC', 'audio', ['flac'], ['audio/flac', 'audio/x-flac'], 'Lossless compressed audio'),
  f('aiff', 'AIFF', 'audio', ['aif', 'aiff', 'aifc'], ['audio/aiff', 'audio/x-aiff'], 'Apple uncompressed audio'),

  // Documents
  f('pdf', 'PDF', 'document', ['pdf'], ['application/pdf']),
  f('docx', 'DOCX', 'document', ['docx'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 'Microsoft Word'),
  f('doc', 'DOC', 'document', ['doc'], ['application/msword'], 'Legacy Word 97-2003'),
  f('odt', 'ODT', 'document', ['odt'], ['application/vnd.oasis.opendocument.text']),
  f('rtf', 'RTF', 'document', ['rtf'], ['application/rtf', 'text/rtf']),
  f('epub', 'EPUB', 'document', ['epub'], ['application/epub+zip']),
  f('md', 'Markdown', 'document', ['md', 'markdown', 'mdown'], ['text/markdown']),
  f('html', 'HTML', 'document', ['html', 'htm', 'xhtml'], ['text/html']),
  f('txt', 'Plain text', 'document', ['txt', 'text', 'log'], ['text/plain']),

  // Presentations
  f('pptx', 'PPTX', 'presentation', ['pptx'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], 'PowerPoint'),
  f('ppt', 'PPT', 'presentation', ['ppt'], ['application/vnd.ms-powerpoint'], 'Legacy PowerPoint 97-2003'),
  f('odp', 'ODP', 'presentation', ['odp'], ['application/vnd.oasis.opendocument.presentation']),
  f('key', 'Keynote', 'presentation', ['key'], ['application/vnd.apple.keynote']),

  // Spreadsheets
  f('xlsx', 'XLSX', 'spreadsheet', ['xlsx', 'xlsm'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], 'Excel workbook'),
  f('xls', 'XLS', 'spreadsheet', ['xls'], ['application/vnd.ms-excel'], 'Legacy Excel 97-2003'),
  f('ods', 'ODS', 'spreadsheet', ['ods'], ['application/vnd.oasis.opendocument.spreadsheet']),
  f('csv', 'CSV', 'spreadsheet', ['csv'], ['text/csv'], 'Comma-separated values'),
  f('tsv', 'TSV', 'spreadsheet', ['tsv', 'tab'], ['text/tab-separated-values'], 'Tab-separated values'),
  f('numbers', 'Numbers', 'spreadsheet', ['numbers'], ['application/vnd.apple.numbers']),

  // Data
  f('json', 'JSON', 'data', ['json'], ['application/json']),
  f('yaml', 'YAML', 'data', ['yaml', 'yml'], ['application/yaml', 'text/yaml']),
  f('xml', 'XML', 'data', ['xml'], ['application/xml', 'text/xml']),
  f('srt', 'SRT', 'data', ['srt'], ['application/x-subrip'], 'SubRip subtitles'),
  f('vtt', 'WebVTT', 'data', ['vtt'], ['text/vtt'], 'Web subtitles'),

  // Archives
  f('zip', 'ZIP', 'archive', ['zip'], ['application/zip', 'application/x-zip-compressed']),
  f('tar', 'TAR', 'archive', ['tar'], ['application/x-tar']),
  f('tgz', 'TAR.GZ', 'archive', ['tgz', 'tar.gz'], ['application/gzip']),
  f('gz', 'GZIP', 'archive', ['gz'], ['application/gzip', 'application/x-gzip']),
  f('7z', '7Z', 'archive', ['7z'], ['application/x-7z-compressed']),
  f('rar', 'RAR', 'archive', ['rar'], ['application/vnd.rar', 'application/x-rar-compressed']),

  // Pseudo-format for operations that emit several original files
  f('files', 'Extracted files', 'other', [], ['application/octet-stream'], 'Individual files from an archive or container'),
]

const byId = new Map(FORMATS.map((fmt) => [fmt.id, fmt]))

export function getFormat(id: string | null | undefined): FormatDef | undefined {
  return id ? byId.get(id) : undefined
}

export function formatLabel(id: string | null | undefined): string {
  return getFormat(id)?.label ?? 'Unknown'
}

/** Longest-suffix match so "archive.tar.gz" resolves to TAR.GZ rather than GZIP. */
export function formatFromFilename(name: string): FormatDef | undefined {
  const lower = name.toLowerCase()
  let best: FormatDef | undefined
  let bestLen = 0
  for (const fmt of FORMATS) {
    for (const ext of fmt.extensions) {
      if (lower.endsWith('.' + ext) && ext.length > bestLen) {
        best = fmt
        bestLen = ext.length
      }
    }
  }
  return best
}

export function formatFromMime(mime: string): FormatDef | undefined {
  const m = mime.toLowerCase().split(';')[0].trim()
  if (!m || m === 'application/octet-stream') return undefined
  return FORMATS.find((fmt) => fmt.mimeTypes.includes(m))
}

export function extensionFor(id: string): string {
  return getFormat(id)?.extensions[0] ?? 'bin'
}

export function mimeFor(id: string): string {
  return getFormat(id)?.outputMime ?? 'application/octet-stream'
}

export function extensionOf(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.tar.gz')) return 'tar.gz'
  const dot = lower.lastIndexOf('.')
  return dot > 0 ? lower.slice(dot + 1) : ''
}
