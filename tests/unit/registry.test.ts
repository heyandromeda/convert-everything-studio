import { describe, expect, it } from 'vitest'
import { allConversions, availabilityOf, conversionsFor, defaultConversionFor, getConversion, unsupportedNotesFor } from '@/registry'
import { FORMATS, getFormat } from '@/registry/formats'
import { defaultOptions, deserializeOptions, serializeOptions, validateOptions } from '@/registry/options'
import type { Capabilities, DetectedFile } from '@/registry/types'

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  isIOS: false,
  isMobile: false,
  webAssembly: true,
  offscreenCanvas: true,
  workers: true,
  webShareFiles: false,
  nativeHeicDecode: null,
  nativeAvifDecode: null,
  maxCanvasPixels: 100_000_000,
  deviceMemoryGB: null,
  ...over,
})

const input = (formatId: string | null, metadata: DetectedFile['metadata'] = {}): DetectedFile => ({ formatId, source: 'signature', extension: '', mime: '', metadata })

describe('conversion registry', () => {
  it('only references known formats and has unique ids', () => {
    const ids = new Set<string>()
    for (const d of allConversions()) {
      expect(ids.has(d.id), d.id).toBe(false)
      ids.add(d.id)
      expect(getFormat(d.to), `${d.id} → ${d.to}`).toBeDefined()
      for (const f of d.from) expect(getFormat(f), `${d.id} from ${f}`).toBeDefined()
      expect(typeof d.load).toBe('function')
      expect(d.limitations.length, `${d.id} documents its limitations`).toBeGreaterThan(0)
    }
  })

  it('every format id is unique', () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length)
  })

  it('offers PNG → WebP and defaults to it', () => {
    const opts = conversionsFor(input('png'), caps(), 1000)
    expect(opts.map((o) => o.def.id)).toContain('image-to-webp')
    expect(defaultConversionFor(opts, input('png'))?.def.id).toBe('image-to-webp')
  })

  it('never offers conversions for unknown input', () => {
    expect(conversionsFor(input(null), caps(), 10)).toEqual([])
  })

  it('offers nothing for legacy binary Office files and explains why', () => {
    expect(conversionsFor(input('doc'), caps(), 10)).toEqual([])
    expect(unsupportedNotesFor('doc')[0].reason).toMatch(/Office/)
  })

  it('does not offer PDF → DOCX', () => {
    expect(conversionsFor(input('pdf'), caps(), 10).some((o) => o.target === 'docx')).toBe(false)
    expect(unsupportedNotesFor('pdf').some((u) => u.to === 'DOCX')).toBe(true)
  })

  it('metadata removal keeps the input format', () => {
    const jpg = conversionsFor(input('jpeg'), caps(), 10).find((o) => o.def.id === 'image-strip-metadata')
    const png = conversionsFor(input('png'), caps(), 10).find((o) => o.def.id === 'image-strip-metadata')
    expect(jpg?.target).toBe('jpeg')
    expect(png?.target).toBe('png')
  })

  it('marks WASM engines unavailable without WebAssembly', () => {
    const webp = conversionsFor(input('png'), caps({ webAssembly: false }), 10).find((o) => o.def.id === 'image-to-webp')
    expect(webp?.availability.available).toBe(false)
    expect(webp?.availability.reason).toMatch(/WebAssembly/)
  })

  it('refuses inputs above the mobile size ceiling before processing', () => {
    const def = getConversion('video-to-mp4')!
    expect(availabilityOf(def, caps({ isMobile: true }), input('mov'), 500 * 1024 * 1024).available).toBe(false)
    expect(availabilityOf(def, caps(), input('mov'), 500 * 1024 * 1024).available).toBe(true)
  })

  it('declares the bitmap-wrapping SVG honestly', () => {
    const d = getConversion('image-to-svg-wrapper')!
    expect(d.label).toMatch(/embedded bitmap/i)
    expect(d.editable).toBe(false)
  })

  it('JPEG output warns about transparency only when the source has alpha', () => {
    const d = getConversion('image-to-jpeg')!
    expect(d.warnings!(input('png', { image: { hasAlpha: true } }), {}, caps()).join()).toMatch(/transparency/)
    expect(d.warnings!(input('png', { image: { hasAlpha: false } }), {}, caps())).toEqual([])
  })

  it('CSV export warns about multi-sheet workbooks', () => {
    const d = getConversion('sheet-to-csv')!
    expect(d.warnings!(input('xlsx', { sheet: { sheetNames: ['A', 'B'] } }), {}, caps()).join()).toMatch(/2 sheets/)
  })
})

describe('options', () => {
  const def = getConversion('image-to-webp')!
  it('builds defaults from the schema', () => {
    const o = defaultOptions(def.options)
    expect(o.qualityPreset).toBe('balanced')
    expect(o.resizeMode).toBe('none')
    expect(o.lossless).toBe(false)
  })
  it('validates numbers only when the field is visible', () => {
    expect(validateOptions(def.options, { resizeMode: 'none', width: -5 })).toEqual([])
    expect(validateOptions(def.options, { resizeMode: 'exact', width: -5 })[0]).toMatch(/Width/)
    expect(validateOptions(def.options, { resizeMode: 'exact', width: 800 })).toEqual([])
  })
  it('validates text patterns', () => {
    const pdf = getConversion('pdf-extract-pages')!
    expect(validateOptions(pdf.options, { pages: '1-3, 5' })).toEqual([])
    expect(validateOptions(pdf.options, { pages: 'first two' })).toHaveLength(1)
  })
  it('round-trips settings and rejects junk', () => {
    const o = { quality: 70, lossless: true, mode: 'fit', entries: ['a'] }
    expect(deserializeOptions(serializeOptions(o))).toEqual(o)
    expect(deserializeOptions('not json')).toEqual({})
    expect(deserializeOptions('[1,2]')).toEqual({})
    expect(deserializeOptions('{"x":{"nested":1},"ok":1}')).toEqual({ ok: 1 })
  })
})

describe('deployment config', () => {
  it('root vercel.json matches the shared security headers', async () => {
    const { readFileSync } = await import('node:fs')
    const { vercelConfig } = await import('../../security-headers.mjs')
    const onDisk = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    expect(onDisk).toEqual(vercelConfig())
    const csp = onDisk.headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy').value
    expect(csp).toContain("connect-src 'self' blob: data:")
    expect(csp).not.toMatch(/https?:/)
  })
})
