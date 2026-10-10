import { archiveLimits, checkArchiveBudget, sanitizeArchivePath } from '@/lib/archive-safety'
import { CanceledError, ConversionError } from '@/lib/errors'
import { safeFilename } from '@/lib/files'
import { formatFromFilename } from '@/registry/formats'
import type { ArchiveEntry, ConverterFn, OutputFile } from '@/registry/types'

type Reader = Awaited<ReturnType<(typeof import('libarchive.js'))['Archive']['open']>>

/** libarchive (WebAssembly) for 7-Zip and RAR. Its worker and WASM are served from /vendor and loaded on demand. */
async function open(file: File): Promise<Reader> {
  const { Archive } = await import('libarchive.js')
  Archive.init({ getWorker: () => new Worker(`${import.meta.env.BASE_URL}vendor/libarchive/worker-bundle.js`, { type: 'module' }) })
  try {
    return await Archive.open(file)
  } catch {
    throw new ConversionError('corrupt', 'This archive could not be opened', 'libarchive could not read the archive structure. It may be damaged or use an unsupported variant.')
  }
}

interface Listed {
  entry: ArchiveEntry
  original: string
  handle: { extract(): Promise<File> }
}

async function list(reader: Reader): Promise<Listed[]> {
  const raw = (await reader.getFilesArray()) as { file: { name: string; size: number; extract(): Promise<File> }; path: string }[]
  return raw.map(({ file, path }) => {
    const original = `${path ?? ''}${file.name}`
    const safe = sanitizeArchivePath(original)
    return { entry: { path: safe.path || original, size: file.size, isDirectory: false, unsafe: safe.problem }, original, handle: file }
  })
}

export async function listLibarchive(file: File): Promise<ArchiveEntry[]> {
  const reader = await open(file)
  try {
    return (await list(reader)).map((l) => l.entry)
  } finally {
    await reader.close().catch(() => {})
  }
}

export const extractLibarchive: ConverterFn = async (ctx) => {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading archive engine' })
  const reader = await open(ctx.file)
  const abort = () => void reader.close().catch(() => {})
  ctx.signal.addEventListener('abort', abort, { once: true })
  try {
    if (await reader.hasEncryptedData()) {
      throw new ConversionError('encrypted', 'This archive is password-protected', 'Encrypted 7-Zip/RAR archives cannot be extracted here.')
    }
    const all = await list(reader)
    const pick = Array.isArray(ctx.options.entries) && ctx.options.entries.length ? new Set(ctx.options.entries) : null
    const wanted = all.filter((l) => !pick || pick.has(l.entry.path))
    const budget = checkArchiveBudget(wanted.map((l) => l.entry), ctx.file.size, archiveLimits(ctx.caps.isMobile))
    if (budget) throw new ConversionError('unsafe-archive', 'Extraction was stopped for safety', budget)
    const outputs: OutputFile[] = []
    for (let i = 0; i < wanted.length; i++) {
      if (ctx.signal.aborted) throw new CanceledError()
      ctx.onProgress({ stage: 'processing', ratio: i / wanted.length, message: `Extracting ${i + 1} of ${wanted.length}` })
      const f = await wanted[i].handle.extract()
      const name = safeFilename(wanted[i].entry.path.split('/').pop() || 'file')
      const fmt = formatFromFilename(name)
      outputs.push({ blob: new Blob([f], { type: fmt?.outputMime ?? 'application/octet-stream' }), name, path: wanted[i].entry.path, formatId: 'files', previewAs: fmt?.id })
    }
    if (!outputs.length) throw new ConversionError('empty-output', 'The archive is empty', 'There were no files to extract.')
    return { outputs, warnings: ['Extracted files are never opened or run by this app. Only open files you trust.'] }
  } catch (e) {
    if (ctx.signal.aborted) throw new CanceledError()
    throw e
  } finally {
    ctx.signal.removeEventListener('abort', abort)
    await reader.close().catch(() => {})
  }
}
