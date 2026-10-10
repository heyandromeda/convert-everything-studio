import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import type { ConverterFn } from '@/registry/types'

export interface Cue {
  start: number
  end: number
  text: string
  settings?: string
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/

function parseTime(s: string): number {
  const m = TIME.exec(s.trim())
  if (!m) throw new Error(`Bad timestamp: ${s.slice(0, 30)}`)
  return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0'))
}

export function formatTime(ms: number, sep: ',' | '.'): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const f = Math.round(ms % 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(f, 3)}`
}

export function parseSubtitles(text: string): Cue[] {
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const cues: Cue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l, i) => i > 0 || l.trim() !== '')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const [a, rest] = lines[ti].split('-->')
    const restTrim = rest.trim()
    const endMatch = TIME.exec(restTrim)
    if (!endMatch) continue
    const settings = restTrim.slice(endMatch.index + endMatch[0].length).trim()
    cues.push({ start: parseTime(a), end: parseTime(endMatch[0]), text: lines.slice(ti + 1).join('\n'), settings: settings || undefined })
  }
  return cues
}

export function toSrt(cues: Cue[]): string {
  // SRT has no styling tags beyond <b><i><u><font>; WebVTT voice/class tags are stripped.
  return cues
    .map((c, i) => `${i + 1}\n${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}\n${c.text.replace(/<\/?(?:v|c|lang|ruby|rt)(?:[.\s][^>]*)?>/g, '')}`)
    .join('\n\n') + '\n'
}

export function toVtt(cues: Cue[]): string {
  return 'WEBVTT\n\n' + cues.map((c) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}${c.settings ? ' ' + c.settings : ''}\n${c.text}`).join('\n\n') + '\n'
}

export const convertSubtitles = (target: 'srt' | 'vtt'): ConverterFn => async (ctx) => {
  let cues: Cue[]
  try {
    cues = parseSubtitles(await ctx.file.text())
  } catch (e) {
    throw new ConversionError('corrupt', 'These subtitles could not be read', e instanceof Error ? e.message : 'Invalid timestamps.')
  }
  if (!cues.length) throw new ConversionError('corrupt', 'No subtitle cues were found', 'The file has no "start --> end" timing lines.')
  const shift = Number(ctx.options.shiftMs ?? 0)
  if (shift) cues = cues.map((c) => ({ ...c, start: Math.max(0, c.start + shift), end: Math.max(0, c.end + shift) }))
  const text = target === 'srt' ? toSrt(cues) : toVtt(cues)
  const warnings = target === 'srt' && cues.some((c) => c.settings) ? ['WebVTT positioning settings were dropped (SRT has no equivalent).'] : []
  return {
    outputs: [{ blob: new Blob([text], { type: target === 'srt' ? 'application/x-subrip;charset=utf-8' : 'text/vtt;charset=utf-8' }), name: outputName(ctx.file.name, target, target === ctx.input.formatId ? '-shifted' : ''), formatId: target }],
    warnings: [`${cues.length} cues converted.`, ...warnings],
  }
}
