import { archiveLimits, checkArchiveBudget, sanitizeArchivePath } from '@/lib/archive-safety'
import { ConversionError, throwIfAborted } from '@/lib/errors'
import { baseName, outputName, safeFilename } from '@/lib/files'
import { formatFromFilename } from '@/registry/formats'
import type { ConvertContext, ConverterFn, OutputFile } from '@/registry/types'
import { readZipDirectory } from '@/lib/zip-directory'
import { listTar } from './tar'

const mimeOf = (name: string) => formatFromFilename(name)?.outputMime ?? 'application/octet-stream'

/** Output names are flattened for download; the original folder path is kept for ZIP export. */
function entryOutput(path: string, data: Uint8Array): OutputFile {
  const fileName = safeFilename(path.split('/').pop() || 'file')
  const fmt = formatFromFilename(fileName)
  return { blob: new Blob([data as BlobPart], { type: mimeOf(fileName) }), name: fileName, path, formatId: 'files', previewAs: fmt?.id }
}

async function gunzipWithLimit(data: Uint8Array, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const { Gunzip } = await import('fflate')
  const chunks: Uint8Array[] = []
  let total = 0
  let error: Error | null = null
  const g = new Gunzip((chunk) => {
    total += chunk.length
    if (total > limit) error = new ConversionError('unsafe-archive', 'This archive expands too much', 'The decompressed data exceeds the safe size for in-browser extraction on this device.')
    else chunks.push(chunk)
  })
  const step = 1 << 20
  for (let i = 0; i < data.length && !error; i += step) {
    throwIfAborted(signal)
    try {
      g.push(data.subarray(i, i + step), i + step >= data.length)
    } catch {
      throw new ConversionError('corrupt', 'The compressed data is damaged', 'The gzip stream could not be decompressed.')
    }
    await new Promise((r) => setTimeout(r, 0))
  }
  if (error) throw error
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function selected(ctx: ConvertContext): Set<string> | null {
  const sel = ctx.options.entries
  return Array.isArray(sel) && sel.length ? new Set(sel) : null
}

async function extractZip(ctx: ConvertContext): Promise<OutputFile[]> {
  const limits = archiveLimits(ctx.caps.isMobile)
  const dir = await readZipDirectory(ctx.file, limits.maxEntries + 1)
  if (!dir) throw new ConversionError('corrupt', 'This ZIP could not be read', 'The archive directory is missing or damaged.')
  if (dir.some((e) => e.encrypted)) throw new ConversionError('encrypted', 'This ZIP is password-protected', 'Encrypted ZIP entries cannot be extracted in the browser.')
  const pick = selected(ctx)
  const wanted = dir.filter((e) => !e.isDirectory && (!pick || pick.has(e.path)))
  const budget = checkArchiveBudget(wanted, ctx.file.size, limits)
  if (budget) throw new ConversionError('unsafe-archive', 'Extraction was stopped for safety', budget)
  const { unzip } = await import('fflate')
  const data = new Uint8Array(await ctx.file.arrayBuffer())
  throwIfAborted(ctx.signal)
  const declared = new Map(wanted.map((e) => [e.path, e.size]))
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      data,
      {
        filter: (f) => {
          const safe = sanitizeArchivePath(f.name).path
          return !f.name.endsWith('/') && declared.has(safe) && f.originalSize <= limits.maxEntryBytes
        },
      },
      (err, out) => (err ? reject(new ConversionError('corrupt', 'The ZIP data is damaged', 'One or more entries could not be decompressed.')) : resolve(out)),
    ),
  )
  return Object.entries(files).map(([name, bytes]) => entryOutput(sanitizeArchivePath(name).path, bytes))
}

async function tarBytes(ctx: ConvertContext): Promise<Uint8Array> {
  const raw = new Uint8Array(await ctx.file.arrayBuffer())
  if (ctx.input.formatId === 'tgz') return gunzipWithLimit(raw, archiveLimits(ctx.caps.isMobile).maxTotalBytes, ctx.signal)
  return raw
}

async function extractTar(ctx: ConvertContext): Promise<OutputFile[]> {
  const limits = archiveLimits(ctx.caps.isMobile)
  const bytes = await tarBytes(ctx)
  const pick = selected(ctx)
  const entries = listTar(bytes, limits.maxEntries + 1).filter((e) => !e.isDirectory && (e.type === '0' || e.type === '\0' || e.type === '7') && (!pick || pick.has(e.path)))
  const budget = checkArchiveBudget(entries, bytes.length, limits)
  if (budget) throw new ConversionError('unsafe-archive', 'Extraction was stopped for safety', budget)
  return entries.map((e) => entryOutput(e.path, bytes.slice(e.offset, e.offset + e.size)))
}

export const extractArchive: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'processing', message: 'Extracting' })
  let outputs: OutputFile[]
  const warnings: string[] = []
  if (ctx.input.formatId === 'zip') outputs = await extractZip(ctx)
  else if (ctx.input.formatId === 'tar' || ctx.input.formatId === 'tgz') outputs = await extractTar(ctx)
  else if (ctx.input.formatId === 'gz') {
    const data = await gunzipWithLimit(new Uint8Array(await ctx.file.arrayBuffer()), archiveLimits(ctx.caps.isMobile).maxEntryBytes, ctx.signal)
    const name = safeFilename(baseName(ctx.file.name)) || 'decompressed'
    outputs = [{ blob: new Blob([data as BlobPart], { type: mimeOf(name) }), name, formatId: 'files' }]
  } else throw new ConversionError('unsupported-input', 'Unsupported archive', 'Only ZIP, TAR, TAR.GZ and GZIP can be extracted.')
  if (!outputs.length) throw new ConversionError('empty-output', 'The archive is empty', 'There were no files to extract.')
  warnings.push('Extracted files are never opened or run by this app. Only open files you trust.')
  const renamed = outputs.filter((o) => o.path && o.path.includes('/')).length
  if (renamed) warnings.push('Folder structure is kept when you use “Download all (ZIP)”; individual downloads use the file name only.')
  return { outputs, warnings }
}

export const repackAsZip: ConverterFn = async (ctx) => {
  const files = ctx.input.formatId === 'zip' ? await extractZip(ctx) : await extractTar(ctx)
  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[f.path ?? f.name] = new Uint8Array(await f.blob.arrayBuffer())
  const zipped = zipSync(entries, { level: 6 })
  return { outputs: [{ blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), name: outputName(ctx.file.name, 'zip'), formatId: 'zip' }], warnings: ['File permissions and symbolic links from the TAR are not carried over.'] }
}

export const compressGzip: ConverterFn = async (ctx) => {
  const { gzipSync } = await import('fflate')
  const data = gzipSync(new Uint8Array(await ctx.file.arrayBuffer()), { level: 9, filename: ctx.file.name.slice(0, 200) })
  return { outputs: [{ blob: new Blob([data as BlobPart], { type: 'application/gzip' }), name: `${safeFilename(ctx.file.name)}.gz`, formatId: 'gz' }] }
}

/** Entry listing for metadata/preview without extracting any data. */
export async function archiveListing(file: File, formatId: string, isMobile: boolean) {
  if (formatId === 'zip') return readZipDirectory(file, 5000)
  if (formatId === 'tar') return listTar(new Uint8Array(await file.arrayBuffer()), 5000)
  if (formatId === 'tgz' && file.size < (isMobile ? 60 : 300) * 1024 * 1024) {
    const bytes = await gunzipWithLimit(new Uint8Array(await file.arrayBuffer()), archiveLimits(isMobile).maxTotalBytes, new AbortController().signal)
    return listTar(bytes, 5000)
  }
  return null
}
