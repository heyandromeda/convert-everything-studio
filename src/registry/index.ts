import { formatLabel, getFormat } from './formats'
import type { Availability, Capabilities, ConversionDef, DetectedFile } from './types'
import { imageConversions } from './conversions/images'
import { documentConversions } from './conversions/documents'
import { spreadsheetConversions } from './conversions/spreadsheets'
import { dataConversions } from './conversions/data'
import { archiveConversions, presentationConversions } from './conversions/archives'
import { mediaConversions } from './conversions/media'
import { combineConversions } from './conversions/combine'
import { UNSUPPORTED } from './unsupported'

const ALL: ConversionDef[] = [
  ...imageConversions,
  ...documentConversions,
  ...spreadsheetConversions,
  ...dataConversions,
  ...presentationConversions,
  ...archiveConversions,
  ...mediaConversions,
  ...combineConversions,
]

const byId = new Map<string, ConversionDef>()
for (const d of ALL) {
  if (byId.has(d.id)) throw new Error(`Duplicate conversion id: ${d.id}`)
  byId.set(d.id, d)
}

export function resolveTarget(def: ConversionDef, input: DetectedFile): string {
  if (def.keepsInputFormat && input.formatId) return input.formatId === 'apng' ? 'png' : input.formatId
  return def.to
}

export function allConversions(): readonly ConversionDef[] {
  return ALL
}

export function getConversion(id: string | null | undefined): ConversionDef | undefined {
  return id ? byId.get(id) : undefined
}

export interface ConversionOption {
  def: ConversionDef
  target: string
  label: string
  availability: Availability
}

export function availabilityOf(def: ConversionDef, caps: Capabilities, input: DetectedFile, fileSize: number): Availability {
  const req = def.requires?.(caps, input)
  if (req && !req.available) return req
  if (def.maxInputMB) {
    const limit = caps.isMobile ? def.maxInputMB.mobile : def.maxInputMB.desktop
    if (fileSize > limit * 1024 * 1024) {
      return {
        available: false,
        reason: `Files over ${limit} MB are too large for this conversion on ${caps.isMobile ? 'a phone' : 'this device'} (it could exhaust browser memory).`,
      }
    }
  }
  return { available: true }
}

/** Every implemented conversion for a detected input, with availability evaluated for this browser. */
export function conversionsFor(input: DetectedFile, caps: Capabilities, fileSize: number): ConversionOption[] {
  if (!input.formatId) return []
  const fmt = input.formatId
  return ALL.filter((d) => d.from.includes(fmt)).map((def) => ({
    def,
    target: resolveTarget(def, input),
    label: def.label ?? formatLabel(def.to),
    availability: availabilityOf(def, caps, input, fileSize),
  }))
}

export function defaultConversionFor(options: ConversionOption[], input: DetectedFile, preferred?: string): ConversionOption | undefined {
  const usable = options.filter((o) => o.availability.available)
  if (preferred) {
    const match = usable.find((o) => o.def.id === preferred)
    if (match) return match
  }
  const fmt = getFormat(input.formatId)
  // Sensible first choices per category, never the identical format.
  const prefs: Record<string, string[]> = {
    image: input.formatId === 'webp' ? ['image-to-png'] : input.formatId === 'heic' ? ['image-to-jpeg'] : ['image-to-webp', 'image-to-png'],
    video: ['video-to-mp4', 'video-to-webm'],
    audio: ['audio-to-mp3'],
    document: input.formatId === 'md' ? ['md-to-html'] : input.formatId === 'pdf' ? ['pdf-to-txt'] : input.formatId === 'docx' ? ['docx-to-pdf'] : ['txt-to-pdf', 'html-to-pdf'],
    spreadsheet: input.formatId === 'csv' || input.formatId === 'tsv' ? ['sheet-to-xlsx'] : ['sheet-to-csv'],
    data: input.formatId === 'json' ? ['sheet-to-csv', 'data-to-yaml'] : input.formatId === 'srt' ? ['subs-to-vtt'] : input.formatId === 'vtt' ? ['subs-to-srt'] : ['data-to-json'],
    presentation: ['pptx-to-txt'],
    archive: ['archive-extract', 'archive-extract-7z', 'archive-extract-rar'],
  }
  for (const id of prefs[fmt?.category ?? ''] ?? []) {
    const m = usable.find((o) => o.def.id === id && o.target !== input.formatId)
    if (m) return m
  }
  return usable.find((o) => o.target !== input.formatId) ?? usable[0]
}

export function unsupportedNotesFor(formatId: string | null): { to: string; reason: string }[] {
  if (!formatId) return []
  return UNSUPPORTED.filter((u) => u.from.includes(formatId)).map((u) => ({ to: u.to, reason: u.reason }))
}
