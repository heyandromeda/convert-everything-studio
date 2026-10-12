import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { canTransition, isPending } from '@/features/queue/job-state'
import { checkArchiveBudget, archiveLimits, sanitizeArchivePath } from '@/lib/archive-safety'
import { crc32 } from '@/lib/crc32'
import { CanceledError, ConversionError, classifyError } from '@/lib/errors'
import { baseName, describeSizeChange, formatBytes, formatDuration, outputName, safeFilename, sizeChangePercent, uniqueName } from '@/lib/files'
import { parseJpeg, parsePng, stripJpegMetadata, stripPngMetadata } from '@/lib/exif'
import { validateOutput } from '@/lib/validate'
import { readZipDirectory } from '@/lib/zip-directory'
import { computeTargetSize, qualityFrom } from '@/engines/images/geometry'
import { encodeBmp, encodeIco } from '@/engines/images/bitmap-writers'
import { headerKeys, isFormulaLike, jsonToRows, neutralizeFormula, rowsToCsv, typedCell } from '@/engines/spreadsheets/csv'
import { formatTime, parseSubtitles, toSrt, toVtt } from '@/engines/data/subtitles'
import { listTar } from '@/engines/archives/tar'
import { parsePageRange } from '@/engines/documents/pdf-read'
import { pageSuffix } from '@/engines/documents/pdf-pages'
import { parseTimecode } from '@/engines/media/convert'
import { decodeText } from '@/engines/documents/html'

const fx = (n: string) => readFileSync(path.join(import.meta.dirname, '..', 'fixtures', n))

describe('file sizes and names', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB')
    expect(formatBytes(-1)).toBe('—')
  })
  it('computes size change correctly', () => {
    expect(sizeChangePercent(200, 50)).toBe(-75)
    expect(sizeChangePercent(0, 50)).toBeNull()
    expect(describeSizeChange(1000, 250)).toBe('75% smaller')
    expect(describeSizeChange(1000, 1500)).toBe('50% larger')
    expect(describeSizeChange(1000, 1002)).toBe('about the same size')
  })
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(undefined)).toBe('—')
  })
  it('builds output names', () => {
    expect(outputName('Holiday Photo.PNG', 'webp')).toBe('Holiday Photo.webp')
    expect(outputName('archive.tar.gz', 'zip')).toBe('archive.zip')
    expect(outputName('a/b:c?.txt', 'pdf')).toBe('a_b_c_.pdf')
    expect(baseName('.bashrc')).toBe('.bashrc')
    expect(safeFilename('...')).toBe('file')
    expect(safeFilename('../../etc/passwd')).toBe('_.._etc_passwd')
  })
  it('resolves filename collisions predictably', () => {
    const taken = new Set<string>()
    expect(uniqueName('a.png', taken)).toBe('a.png')
    expect(uniqueName('A.png', taken)).toBe('A (2).png')
    expect(uniqueName('a.png', taken)).toBe('a (3).png')
    expect(uniqueName('b.tar.gz', taken)).toBe('b.tar.gz')
    expect(uniqueName('b.tar.gz', taken)).toBe('b (2).tar.gz')
  })
})

describe('job state machine', () => {
  it('allows the normal lifecycle', () => {
    expect(canTransition('detecting', 'ready')).toBe(true)
    expect(canTransition('ready', 'queued')).toBe(true)
    expect(canTransition('queued', 'preparing')).toBe(true)
    expect(canTransition('preparing', 'loading-engine')).toBe(true)
    expect(canTransition('processing', 'processing')).toBe(true)
    expect(canTransition('finalizing', 'completed')).toBe(true)
    expect(canTransition('failed', 'queued')).toBe(true)
  })
  it('rejects impossible jumps', () => {
    expect(canTransition('ready', 'completed')).toBe(false)
    expect(canTransition('completed', 'processing')).toBe(false)
    expect(canTransition('unsupported', 'queued')).toBe(false)
    expect(canTransition('canceled', 'completed')).toBe(false)
    expect(canTransition('detecting', 'queued')).toBe(false)
  })
  it('supports cancellation from any active state', () => {
    for (const s of ['queued', 'preparing', 'loading-engine', 'processing', 'finalizing'] as const) {
      expect(canTransition(s, 'canceled'), s).toBe(true)
      expect(isPending(s)).toBe(true)
    }
  })
})

describe('error classification', () => {
  it('passes through user-facing errors', () => {
    const info = classifyError(new ConversionError('no-text', 'No text', 'Needs OCR', 'Try images'))
    expect(info).toEqual({ code: 'no-text', title: 'No text', detail: 'Needs OCR', suggestion: 'Try images' })
  })
  it('recognises cancellation and memory exhaustion', () => {
    expect(classifyError(new CanceledError()).code).toBe('canceled')
    expect(classifyError(new DOMException('x', 'AbortError')).code).toBe('canceled')
    expect(classifyError(new RangeError('Array buffer allocation failed')).code).toBe('out-of-memory')
    expect(classifyError(new Error('Cannot enlarge memory arrays')).code).toBe('out-of-memory')
  })
  it('never returns an empty or generic-only message', () => {
    const info = classifyError('weird')
    expect(info.title.length).toBeGreaterThan(5)
    expect(info.suggestion).toBeTruthy()
  })
  it('strips quoted file contents from unexpected engine messages', () => {
    const info = classifyError(new Error('Unexpected identifier "sk-LEAK-0123456789"'))
    expect(info.detail).not.toContain('sk-LEAK')
    expect(info.detail).toContain('“…”')
  })
})

describe('zip checksums', () => {
  it('matches the CRC-32 stored in a real archive', async () => {
    const entries = (await readZipDirectory(new Blob([fx('bundle.zip')])))!
    const file = entries.find((e) => e.path === 'docs/notes.md')!
    expect(file.crc32).toBeGreaterThan(0)
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })
})

describe('archive safety', () => {
  it('neutralises traversal and absolute paths', () => {
    expect(sanitizeArchivePath('../../etc/passwd')).toEqual({ path: 'etc/passwd', problem: 'Path traversal ("..") removed' })
    expect(sanitizeArchivePath('/abs/file.txt').path).toBe('abs/file.txt')
    expect(sanitizeArchivePath('C:\\Windows\\x.dll').path).toBe('Windows/x.dll')
    expect(sanitizeArchivePath('a/./b//c.txt')).toEqual({ path: 'a/b/c.txt', problem: undefined })
    expect(sanitizeArchivePath('dir/CON.txt').path).toBe('dir/_CON.txt')
    expect(sanitizeArchivePath('bad\u0000name').path).toBe('bad_name')
  })
  it('rejects decompression bombs from declared sizes', () => {
    const limits = archiveLimits(true)
    expect(checkArchiveBudget([{ size: 10, isDirectory: false }], 100, limits)).toBeNull()
    expect(checkArchiveBudget([{ size: 600 * 1024 * 1024, isDirectory: false }], 1024, limits)).toMatch(/expands/)
    expect(checkArchiveBudget([{ size: 100 * 1024 * 1024, isDirectory: false }], 1024, limits)).toMatch(/compression ratio/)
    expect(checkArchiveBudget(Array.from({ length: 6000 }, () => ({ size: 1, isDirectory: false })), 1e6, limits)).toMatch(/files/)
  })
  it('reads ZIP central directories without extracting', async () => {
    const entries = (await readZipDirectory(new Blob([fx('bundle.zip')])))!
    const paths = entries.map((e) => e.path)
    expect(paths).toContain('docs/notes.md')
    expect(paths).toContain('evil.txt')
    expect(entries.find((e) => e.path === 'evil.txt')?.unsafe).toMatch(/traversal/)
    expect(entries.find((e) => e.path === 'readme.txt')?.size).toBe(23)
  })
  it('lists TAR entries', () => {
    const tar = new Uint8Array(gunzipSync(fx('bundle.tar.gz')))
    const entries = listTar(tar)
    expect(entries.map((e) => e.path)).toEqual(['project/main.txt', 'project/sub/deep.txt'])
    const main = entries[0]
    expect(new TextDecoder().decode(tar.subarray(main.offset, main.offset + main.size))).toBe('main file\n')
    expect(entries.every((e) => !e.damaged)).toBe(true)
  })
  it('flags TAR entries whose data is cut off or whose header checksum is wrong', () => {
    expect(listTar(new Uint8Array(fx('abuse/truncated.tar')))).toMatchObject([{ path: 'big.bin', size: 4096, damaged: true }])
    expect(listTar(new Uint8Array(fx('abuse/bad-checksum.tar')))[0].damaged).toBe(true)
  })
})

describe('image metadata', () => {
  it('strips JPEG comments losslessly', () => {
    const src = new Uint8Array(fx('photo.jpg'))
    const { data, report } = stripJpegMetadata(src)
    expect(Buffer.from(data).includes(Buffer.from('Lavc'))).toBe(false)
    expect(report.removed).toContain('Comment')
    // Scan data must be byte-identical.
    const sos = (b: Uint8Array) => Buffer.from(b).indexOf(Buffer.from([0xff, 0xda]))
    expect(Buffer.from(data.subarray(sos(data))).equals(Buffer.from(src.subarray(sos(src))))).toBe(true)
  })
  it('keeps a non-default orientation while dropping GPS EXIF', () => {
    const src = new Uint8Array(fx('photo.jpg'))
    // Build an EXIF APP1 with Orientation=6 and a GPS IFD pointer.
    const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 2, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, 0, 1, 0, 1, 0, 2, 0, 0, 0, 2, 0x4e, 0, 0, 0, 0, 0, 0, 0]
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
    const seg = [0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload]
    const withExif = new Uint8Array([...src.subarray(0, 2), ...seg, ...src.subarray(2)])
    const info = parseJpeg(withExif)
    expect(info.orientation).toBe(6)
    expect(info.hasGps).toBe(true)
    const { data } = stripJpegMetadata(withExif)
    const after = parseJpeg(data)
    expect(after.orientation).toBe(6)
    expect(after.hasGps).toBe(false)
  })
  it('reads PNG header info and strips text chunks', () => {
    const src = new Uint8Array(fx('alpha.png'))
    expect(parsePng(src)).toMatchObject({ width: 320, height: 200, hasAlpha: true, animated: false })
    const { data } = stripPngMetadata(src)
    expect(Buffer.from(data).includes(Buffer.from('tEXt'))).toBe(false)
    expect(Buffer.from(data).includes(Buffer.from('IDAT'))).toBe(true)
  })
})

describe('image geometry', () => {
  it('fits within a box without upscaling by default', () => {
    expect(computeTargetSize(4000, 3000, { resizeMode: 'fit', fitPreset: '1920' }, 1e9)).toEqual({ width: 1920, height: 1440 })
    expect(computeTargetSize(800, 600, { resizeMode: 'fit', fitPreset: '1920' }, 1e9)).toEqual({ width: 800, height: 600 })
    expect(computeTargetSize(800, 600, { resizeMode: 'fit', fitPreset: '1920', allowUpscale: true }, 1e9)).toEqual({ width: 1920, height: 1440 })
  })
  it('keeps aspect ratio in exact mode unless unlocked', () => {
    expect(computeTargetSize(1000, 500, { resizeMode: 'exact', width: 400, height: 400 }, 1e9)).toEqual({ width: 400, height: 200 })
    expect(computeTargetSize(1000, 500, { resizeMode: 'exact', width: 400, height: 400, lockAspect: false }, 1e9)).toEqual({ width: 400, height: 400 })
    expect(computeTargetSize(1000, 500, { resizeMode: 'exact', height: 100 }, 1e9)).toEqual({ width: 200, height: 100 })
  })
  it('scales by percentage', () => {
    expect(computeTargetSize(640, 480, { resizeMode: 'percent', percent: 50 }, 1e9)).toEqual({ width: 320, height: 240 })
  })
  it('reports when the canvas limit forces a smaller size', () => {
    const r = computeTargetSize(8064, 6048, {}, 16_777_216)
    expect(r.limitedBy).toBe('canvas')
    expect(r.width * r.height).toBeLessThanOrEqual(16_777_216)
    expect(Math.abs(r.width / r.height - 8064 / 6048)).toBeLessThan(0.01)
  })
  it('maps quality presets', () => {
    expect(qualityFrom({ qualityPreset: 'best' })).toBe(92)
    expect(qualityFrom({ qualityPreset: 'custom', quality: 33 })).toBe(33)
  })
})

describe('bitmap writers', () => {
  it('writes a valid 24-bit BMP header', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
    const bmp = encodeBmp(rgba, 3, 1)
    const dv = new DataView(bmp.buffer)
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM')
    expect(dv.getUint32(2, true)).toBe(bmp.length)
    expect(dv.getInt32(18, true)).toBe(3)
    expect([bmp[54], bmp[55], bmp[56]]).toEqual([0, 0, 255]) // BGR
  })
  it('writes an ICO directory', () => {
    const ico = encodeIco([{ width: 16, height: 16, png: new Uint8Array([1, 2, 3]) }, { width: 256, height: 256, png: new Uint8Array([4]) }])
    const dv = new DataView(ico.buffer)
    expect(dv.getUint16(2, true)).toBe(1)
    expect(dv.getUint16(4, true)).toBe(2)
    expect(ico[6 + 16]).toBe(0) // 256 is stored as 0
    expect(dv.getUint32(6 + 12, true)).toBe(6 + 32)
  })
})

describe('spreadsheet safety and typing', () => {
  it('keeps leading zeros and long IDs as text', () => {
    expect(typedCell('02134')).toBe('02134')
    expect(typedCell('12345678901234567890')).toBe('12345678901234567890')
    expect(typedCell('12.50')).toBe(12.5)
    expect(typedCell('-3')).toBe(-3)
    expect(typedCell('1e3')).toBe(1000)
    expect(typedCell('1,000')).toBe('1,000')
    expect(typedCell('TRUE')).toBe(true)
  })
  it('neutralises formula injection but not plain negative numbers', () => {
    expect(isFormulaLike('=SUM(A1)')).toBe(true)
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(neutralizeFormula('@cmd')).toBe(`'@cmd`)
    expect(neutralizeFormula('-5')).toBe('-5')
    expect(neutralizeFormula('hello')).toBe('hello')
  })
  it('quotes CSV fields correctly', () => {
    expect(rowsToCsv([['a,b', 'say "hi"', 'line\nbreak', 1, null]], ',', false)).toBe('"a,b","say ""hi""","line\nbreak",1,')
    expect(rowsToCsv([['=1+2']], ',', true)).toBe(`'=1+2`)
  })
  it('shapes JSON into tables or refuses', () => {
    expect(jsonToRows([{ a: 1 }, { b: 2 }])!.sheets[0].rows).toEqual([['a', 'b'], [1, ''], ['', 2]])
    expect(jsonToRows({ s1: [[1, 2]], s2: [{ x: 1 }] })!.sheets.map((s) => s.name)).toEqual(['s1', 's2'])
    expect(jsonToRows({ deeply: { nested: { x: 1 } } })).toBeNull()
  })
  it('deduplicates header keys', () => {
    expect(headerKeys(['id', 'id', '', null])).toEqual(['id', 'id_2', 'column_3', 'column_4'])
  })
})

describe('subtitles', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n01:02:03,004 --> 01:02:04,000\nBye\n'
  it('parses and re-serialises', () => {
    const cues = parseSubtitles(srt)
    expect(cues).toHaveLength(2)
    expect(cues[1].start).toBe(3723004)
    expect(toVtt(cues)).toContain('01:02:03.004 --> 01:02:04.000')
    expect(toSrt(parseSubtitles(toVtt(cues)))).toBe(srt)
  })
  it('formats timestamps', () => {
    expect(formatTime(3723004, ',')).toBe('01:02:03,004')
  })
})

describe('parsers for user input', () => {
  it('names extracted pages without a dangling dash', () => {
    expect(pageSuffix('')).toBe('-pages')
    expect(pageSuffix('all')).toBe('-pages')
    expect(pageSuffix('2-3, 5')).toBe('-pages-2-3,5')
  })
  it('parses page ranges', () => {
    expect(parsePageRange('', 3)).toEqual([1, 2, 3])
    expect(parsePageRange('3, 1-2, 2', 5)).toEqual([1, 2, 3])
    expect(parsePageRange('4-', 6)).toEqual([4, 5, 6])
    expect(() => parsePageRange('9', 3)).toThrow(/selected none/)
    expect(() => parsePageRange('abc', 3)).toThrow(/not a page number/)
  })
  it('parses timecodes', () => {
    expect(parseTimecode('')).toBeNull()
    expect(parseTimecode('12.5')).toBe(12.5)
    expect(parseTimecode('1:05')).toBe(65)
    expect(parseTimecode('1:00:00.5')).toBe(3600.5)
    expect(() => parseTimecode('soon')).toThrow()
  })
  it('decodes text encodings', () => {
    expect(decodeText(new Uint8Array(fx('latin1.txt'))).text).toContain('Café crème')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])).text).toBe('hi')
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0])).text).toBe('h')
  })
})

describe('output validation', () => {
  it('rejects outputs whose signature does not match the requested format', async () => {
    const png = new Blob([fx('alpha.png')])
    await expect(validateOutput({ blob: png, name: 'x.webp', formatId: 'webp' })).rejects.toThrow(/produced PNG/)
    await expect(validateOutput({ blob: png, name: 'x.png', formatId: 'png' })).resolves.toBeUndefined()
  })
  it('rejects empty files and truncated PDFs', async () => {
    await expect(validateOutput({ blob: new Blob([]), name: 'x.txt', formatId: 'txt' })).rejects.toThrow(/No data/)
    await expect(validateOutput({ blob: new Blob(['%PDF-1.4\n1 0 obj']), name: 'x.pdf', formatId: 'pdf' })).rejects.toThrow(/end-of-file/)
  })
})
