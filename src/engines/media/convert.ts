import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import { extensionFor, getFormat, mimeFor } from '@/registry/formats'
import type { ConvertContext, ConverterFn, OptionValues } from '@/registry/types'
import { runFFmpeg } from './ffmpeg'

/** Accepts seconds ("75", "12.5") or clock time ("1:15", "0:01:15.5"). Empty means unset. */
export function parseTimecode(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s)
  if (!m) throw new ConversionError('invalid-options', 'The trim time is not valid', `"${s.slice(0, 16)}" is not a time. Use seconds (e.g. 12.5) or minutes:seconds (e.g. 1:05).`)
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function trimArgs(o: OptionValues, duration?: number): { pre: string[]; post: string[]; length?: number } {
  const start = parseTimecode(o.trimStart)
  const end = parseTimecode(o.trimEnd)
  if (start !== null && end !== null && end <= start) {
    throw new ConversionError('invalid-options', 'The trim range is empty', 'The end time must be after the start time.')
  }
  if (duration && start !== null && start >= duration) {
    throw new ConversionError('invalid-options', 'The start time is past the end', `This file is only ${duration.toFixed(1)} seconds long.`)
  }
  const pre = start !== null ? ['-ss', String(start)] : []
  const post = end !== null ? ['-t', String(end - (start ?? 0))] : []
  const effEnd = end ?? duration
  const length = effEnd !== undefined ? effEnd - (start ?? 0) : undefined
  return { pre, post, length }
}

const AUDIO_CODEC: Record<string, { codec: string[]; lossy: boolean; container?: string[] }> = {
  mp3: { codec: ['-c:a', 'libmp3lame'], lossy: true },
  m4a: { codec: ['-c:a', 'aac'], lossy: true, container: ['-movflags', '+faststart'] },
  aac: { codec: ['-c:a', 'aac'], lossy: true, container: ['-f', 'adts'] },
  ogg: { codec: ['-c:a', 'libvorbis'], lossy: true },
  // libopus crashes the WebAssembly build on stereo input; FFmpeg's native encoder is stable.
  opus: { codec: ['-c:a', 'opus', '-strict', '-2'], lossy: true, container: ['-f', 'ogg'] },
  flac: { codec: ['-c:a', 'flac'], lossy: false },
  wav: { codec: ['-c:a', 'pcm_s16le'], lossy: false },
  aiff: { codec: ['-c:a', 'pcm_s16be'], lossy: false, container: ['-f', 'aiff'] },
}

const LOSSLESS_AUDIO = new Set(['wav', 'flac', 'aiff'])

function audioParams(o: OptionValues, target: string): string[] {
  const args: string[] = []
  if (AUDIO_CODEC[target].lossy) args.push('-b:a', `${Number(o.bitrate ?? 192)}k`)
  // Opus is defined at 48 kHz; other rates are rejected by the encoder.
  if (target === 'opus') args.push('-ar', '48000')
  else if (o.sampleRate && o.sampleRate !== 'keep') args.push('-ar', String(o.sampleRate))
  if (o.channels === 'mono') args.push('-ac', '1')
  else if (o.channels === 'stereo' || target === 'opus') args.push('-ac', '2')
  return args
}

const metadataArgs = (o: OptionValues) => (o.stripMetadata === true ? ['-map_metadata', '-1'] : ['-map_metadata', '0'])

function inputExt(ctx: ConvertContext) {
  return extensionFor(ctx.input.formatId ?? 'bin')
}

async function finish(ctx: ConvertContext, data: Uint8Array, target: string, suffix = '', warnings: string[] = []) {
  if (!data.length) throw new ConversionError('empty-output', 'The media engine produced an empty file', 'No audio or video data was written.')
  return {
    outputs: [{ blob: new Blob([data as BlobPart], { type: mimeFor(target) }), name: outputName(ctx.file.name, target, suffix), formatId: target }],
    warnings,
  }
}

export const toAudio = (target: string): ConverterFn => async (ctx) => {
  const duration = ctx.input.metadata.media?.duration
  const trim = trimArgs(ctx.options, duration)
  const fromVideo = getFormat(ctx.input.formatId)?.category === 'video'
  const out = `/out.${extensionFor(target)}`
  const data = await runFFmpeg({
    file: ctx.file,
    inputExt: inputExt(ctx),
    outputPath: out,
    expectedDuration: trim.length,
    signal: ctx.signal,
    onLoading: (m) => ctx.onProgress({ stage: 'loading-engine', message: m }),
    onProgress: (r) => ctx.onProgress({ stage: 'processing', ratio: r, message: fromVideo ? 'Extracting audio' : 'Converting audio' }),
    buildArgs: (input) => [...trim.pre, '-i', input, ...trim.post, '-vn', '-sn', '-dn', ...metadataArgs(ctx.options), ...AUDIO_CODEC[target].codec, ...audioParams(ctx.options, target), ...(AUDIO_CODEC[target].container ?? []), out],
  })
  const warnings: string[] = []
  const sourceLossy = !fromVideo && !LOSSLESS_AUDIO.has(ctx.input.formatId ?? '')
  if (sourceLossy && AUDIO_CODEC[target].lossy) warnings.push('Converting between lossy formats loses a little quality each time.')
  if (sourceLossy && !AUDIO_CODEC[target].lossy) warnings.push('A lossless format cannot restore quality already lost in the original; it only prevents further loss.')
  return finish(ctx, data, target, fromVideo ? '-audio' : '', warnings)
}

const SCALE: Record<string, string> = { '2160': '3840:2160', '1080': '1920:1080', '720': '1280:720', '480': '854:480', '360': '640:360' }

function videoFilters(o: OptionValues): string[] {
  const vf: string[] = []
  const h = String(o.maxHeight ?? 'keep')
  if (SCALE[h]) {
    const [w, hh] = SCALE[h].split(':')
    // Fit within the box, never upscale, keep even dimensions for H.264.
    vf.push(`scale='min(${w},iw)':'min(${hh},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`)
  } else vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  if (o.fps && o.fps !== 'keep') vf.push(`fps=${Number(o.fps)}`)
  return vf.length ? ['-vf', vf.join(',')] : []
}

const CRF: Record<string, { x264: number; vp8: number; vp8Rate: string }> = {
  high: { x264: 20, vp8: 8, vp8Rate: '4M' },
  balanced: { x264: 24, vp8: 12, vp8Rate: '2M' },
  small: { x264: 30, vp8: 20, vp8Rate: '800k' },
}

export const toVideo = (target: 'mp4' | 'mov' | 'mkv' | 'webm'): ConverterFn => async (ctx) => {
  const duration = ctx.input.metadata.media?.duration
  const trim = trimArgs(ctx.options, duration)
  const o = ctx.options
  const copy = o.copyStreams === true
  const noAudio = o.removeAudio === true
  const q = CRF[String(o.quality ?? 'balanced')] ?? CRF.balanced
  const out = `/out.${extensionFor(target)}`
  const warnings: string[] = []
  let codecArgs: string[]
  if (copy) {
    codecArgs = ['-c', 'copy', ...(noAudio ? ['-an'] : [])]
    warnings.push('Streams were copied without re-encoding, so quality is identical to the original.')
  } else if (target === 'webm') {
    codecArgs = ['-c:v', 'libvpx', '-crf', String(q.vp8), '-b:v', q.vp8Rate, '-deadline', 'realtime', '-cpu-used', '8', ...(noAudio ? ['-an'] : ['-c:a', 'libvorbis', '-b:a', '128k'])]
  } else {
    codecArgs = ['-c:v', 'libx264', '-preset', ctx.caps.isMobile ? 'ultrafast' : 'veryfast', '-crf', String(q.x264), '-pix_fmt', 'yuv420p', ...(noAudio ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k'])]
  }
  if (target === 'mp4' || target === 'mov') codecArgs.push('-movflags', '+faststart')
  const data = await runFFmpeg({
    file: ctx.file,
    inputExt: inputExt(ctx),
    outputPath: out,
    expectedDuration: trim.length,
    signal: ctx.signal,
    onLoading: (m) => ctx.onProgress({ stage: 'loading-engine', message: m }),
    onProgress: (r) => ctx.onProgress({ stage: 'processing', ratio: r, message: copy ? 'Copying streams' : 'Encoding video' }),
    buildArgs: (input) => [
      ...trim.pre,
      '-i', input,
      ...trim.post,
      '-map', '0:v:0', ...(noAudio ? [] : ['-map', '0:a:0?']),
      '-sn', '-dn',
      ...metadataArgs(o),
      ...(copy ? [] : videoFilters(o)),
      ...codecArgs,
      out,
    ],
  })
  if (!copy) warnings.push(target === 'webm' ? 'Encoded as VP8 video with Vorbis audio (VP9/AV1 are too slow in the browser).' : 'Encoded as H.264 video with AAC audio.')
  return finish(ctx, data, target, target === ctx.input.formatId ? '-converted' : '', warnings)
}

export const toGif: ConverterFn = async (ctx) => {
  const duration = ctx.input.metadata.media?.duration
  const o = { ...ctx.options }
  // GIFs balloon quickly: default to the first 10 seconds unless the user set a range.
  if (!o.trimEnd && duration && duration > 10) o.trimEnd = String((parseTimecode(o.trimStart) ?? 0) + 10)
  const trim = trimArgs(o, duration)
  const fps = Number(o.gifFps ?? 12)
  const width = Number(o.gifWidth ?? 480)
  const out = '/out.gif'
  const data = await runFFmpeg({
    file: ctx.file,
    inputExt: inputExt(ctx),
    outputPath: out,
    expectedDuration: trim.length,
    signal: ctx.signal,
    onLoading: (m) => ctx.onProgress({ stage: 'loading-engine', message: m }),
    onProgress: (r) => ctx.onProgress({ stage: 'processing', ratio: r, message: 'Rendering GIF' }),
    buildArgs: (input) => [
      ...trim.pre, '-i', input, ...trim.post, '-an',
      '-vf', `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', out,
    ],
  })
  const warnings = ['GIF is limited to 256 colours and has no sound.']
  if (!ctx.options.trimEnd && duration && duration > 10) warnings.push('Only the first 10 seconds were converted. Set an end time to change this.')
  return finish(ctx, data, 'gif', '', warnings)
}

export const videoThumbnail: ConverterFn = async (ctx) => {
  const at = parseTimecode(ctx.options.at) ?? Math.min(1, (ctx.input.metadata.media?.duration ?? 2) / 2)
  const data = await runFFmpeg({
    file: ctx.file,
    inputExt: inputExt(ctx),
    outputPath: '/thumb.jpg',
    signal: ctx.signal,
    onLoading: (m) => ctx.onProgress({ stage: 'loading-engine', message: m }),
    onProgress: () => ctx.onProgress({ stage: 'processing', ratio: null, message: 'Grabbing frame' }),
    // Note: "-q:v" makes the WebAssembly MJPEG encoder hang, so the default quality is used.
    buildArgs: (input) => ['-ss', String(at), '-i', input, '-frames:v', '1', '/thumb.jpg'],
  })
  return finish(ctx, data, 'jpeg', '-frame')
}
