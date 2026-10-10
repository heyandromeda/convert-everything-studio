import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { CanceledError, ConversionError } from '@/lib/errors'

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

/**
 * Loads the single-threaded FFmpeg core from this site's own /vendor folder. The
 * single-threaded build avoids SharedArrayBuffer, so no cross-origin isolation is needed.
 */
export async function getFFmpeg(onLoadingMessage?: (m: string) => void): Promise<FFmpeg> {
  if (instance?.loaded) return instance
  loading ??= (async () => {
    onLoadingMessage?.('Downloading media engine (~32 MB, first time only)')
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const ff = new FFmpeg()
    const base = `${location.origin}${import.meta.env.BASE_URL}vendor/ffmpeg`
    try {
      await ff.load({ coreURL: `${base}/ffmpeg-core.js`, wasmURL: `${base}/ffmpeg-core.wasm` })
    } catch (e) {
      ff.terminate()
      throw new ConversionError(
        'engine-load-failed',
        'The media engine could not start',
        navigator.onLine ? `FFmpeg failed to load${e instanceof Error ? `: ${e.message.slice(0, 120)}` : '.'}` : 'You are offline and the media engine has not been downloaded on this device yet.',
        'Check your connection, then try again. On iPhone, closing other tabs frees memory.',
      )
    }
    instance = ff
    return ff
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

export function resetFFmpeg() {
  try {
    instance?.terminate()
  } catch {
    /* already gone */
  }
  instance = null
  loading = null
}

export interface RunOptions {
  file: File
  /** Name used inside the virtual filesystem; only the extension matters to FFmpeg. */
  inputExt: string
  buildArgs: (inputPath: string) => string[]
  outputPath: string
  /** Seconds of media being produced, used to turn FFmpeg timestamps into a real percentage. */
  expectedDuration?: number
  signal: AbortSignal
  onProgress: (ratio: number | null) => void
  onLoading: (message: string) => void
}

const ERROR_HINTS: [RegExp, () => ConversionError][] = [
  [/does not contain any stream|Output file is empty|matches no streams/i, () => new ConversionError('unsupported-input', 'There is no matching stream in this file', 'For example, the video has no audio track to extract.', 'Choose a different output.')],
  [/Invalid data found when processing input|moov atom not found|EBML header parsing failed/i, () => new ConversionError('corrupt', 'The media file appears damaged', 'FFmpeg could not read the file structure. It may be incomplete or corrupted.')],
  [/Decoder .* not found|unknown codec|Unsupported codec|no decoder/i, () => new ConversionError('codec-unavailable', 'This codec cannot be decoded here', 'The file uses a codec that the in-browser media engine does not include.', 'Try a different source format.')],
  [/Could not find tag for codec|codec not currently supported in container|Could not write header/i, () => new ConversionError('codec-unavailable', 'These streams cannot be copied into that container', 'Fast stream copy only works when the codecs are allowed in the target container.', 'Turn off “Copy streams” to re-encode instead.')],
  [/Cannot allocate memory|out of memory|OOM/i, () => new ConversionError('out-of-memory', 'The browser ran out of memory', 'This media file needed more memory than the tab allows.', 'Trim the clip, lower the resolution, or use a computer for very large files.')],
]

/** Runs one FFmpeg command against a mounted input file and returns the output bytes. */
export async function runFFmpeg(opts: RunOptions): Promise<Uint8Array> {
  if (opts.signal.aborted) throw new CanceledError()
  opts.onLoading(instance?.loaded ? 'Starting media engine' : 'Downloading media engine (~32 MB, first time only)')
  const ff = await getFFmpeg(opts.onLoading)
  if (opts.signal.aborted) throw new CanceledError()

  const logs: string[] = []
  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    if (logs.length > 200) logs.shift()
  }
  const onProgress = ({ time }: { time: number }) => {
    if (opts.expectedDuration && opts.expectedDuration > 0 && time > 0) opts.onProgress(Math.min(0.99, time / 1e6 / opts.expectedDuration))
  }
  ff.on('log', onLog)
  ff.on('progress', onProgress)

  const abort = () => resetFFmpeg()
  opts.signal.addEventListener('abort', abort, { once: true })

  const mountDir = `/in-${Date.now().toString(36)}`
  const inputName = `input.${opts.inputExt.replace(/[^a-z0-9]/gi, '') || 'bin'}`
  try {
    await ff.createDir(mountDir)
    // WORKERFS reads the file lazily instead of copying it into WebAssembly memory.
    const renamed = new File([opts.file], inputName, { type: opts.file.type })
    await ff.mount('WORKERFS' as never, { files: [renamed] }, mountDir)
    opts.onProgress(opts.expectedDuration ? 0 : null)
    const code = await ff.exec(['-hide_banner', '-nostdin', '-y', ...opts.buildArgs(`${mountDir}/${inputName}`)])
    if (opts.signal.aborted) throw new CanceledError()
    if (code !== 0) {
      const text = logs.join('\n')
      for (const [re, make] of ERROR_HINTS) if (re.test(text)) throw make()
      const last = logs.filter((l) => /error|invalid|failed/i.test(l)).slice(-1)[0]
      throw new ConversionError('unknown', 'The media conversion failed', last ? `FFmpeg reported: ${last.slice(0, 180)}` : `FFmpeg exited with code ${code}.`)
    }
    const data = (await ff.readFile(opts.outputPath)) as Uint8Array
    await ff.deleteFile(opts.outputPath).catch(() => {})
    return data
  } catch (e) {
    if (opts.signal.aborted) throw new CanceledError()
    if (e instanceof ConversionError || e instanceof CanceledError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (/memory|RangeError/i.test(msg)) throw ERROR_HINTS[4][1]()
    // A crashed worker cannot be reused.
    resetFFmpeg()
    throw new ConversionError('unknown', 'The media engine stopped unexpectedly', msg.slice(0, 180), 'Try again; for large files, trim or lower the resolution first.')
  } finally {
    opts.signal.removeEventListener('abort', abort)
    if (instance === ff) {
      ff.off('log', onLog)
      ff.off('progress', onProgress)
      await ff.unmount(mountDir).catch(() => {})
      await ff.deleteDir(mountDir).catch(() => {})
    }
  }
}
