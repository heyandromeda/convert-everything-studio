import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectFile, isAlias, sniffSignature, sniffText } from '@/lib/detect'
import { extensionOf, formatFromFilename, formatFromMime } from '@/registry/formats'

const fx = (n: string) => readFileSync(path.join(import.meta.dirname, '..', 'fixtures', n))
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const file = (name: string, type = '') => new File([fx(name)], name, { type })

describe('sniffSignature', () => {
  it.each([
    ['png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], 'IHDR')],
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])],
    ['gif', bytes('GIF89a')],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')],
    ['wav', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
    ['avi', bytes('RIFF', [0, 0, 0, 0], 'AVI LIST')],
    ['pdf', bytes('%PDF-1.7')],
    ['flac', bytes('fLaC')],
    ['mp3', bytes('ID3', [3, 0])],
    ['7z', bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
    ['rar', bytes('Rar!')],
    ['rtf', bytes('{\\rtf1')],
    ['tiff', bytes('II*', [0])],
    ['gz', bytes([0x1f, 0x8b, 8])],
    ['mov', bytes([0, 0, 0, 20], 'ftypqt  ', [0, 0, 0, 0], 'qt  ')],
    ['heic', bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic')],
    ['avif', bytes([0, 0, 0, 28], 'ftypavif', [0, 0, 0, 0], 'avifmif1miaf')],
    ['m4a', bytes([0, 0, 0, 20], 'ftypM4A ', [0, 0, 0, 0], 'M4A ')],
    ['mp4', bytes([0, 0, 0, 20], 'ftypisom', [0, 0, 2, 0], 'isom')],
    ['webm', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81], 'webm')],
  ])('detects %s', (expected, b) => {
    expect(sniffSignature(b)).toBe(expected)
  })

  it('returns null for plain text', () => {
    expect(sniffSignature(bytes('hello world'))).toBeNull()
  })

  it('detects APNG by its acTL chunk', () => {
    const png = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], 'IHDR', new Array(17).fill(0), [0, 0, 0, 8], 'acTL', new Array(12).fill(0))
    expect(sniffSignature(png)).toBe('apng')
  })
})

describe('sniffText', () => {
  it.each([
    ['vtt', 'WEBVTT\n\n00:00.000 --> 00:01.000\nhi'],
    ['srt', '1\n00:00:01,000 --> 00:00:02,000\nhi'],
    ['html', '<!DOCTYPE html><html></html>'],
    ['svg', '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['xml', '<?xml version="1.0"?><root/>'],
    ['json', '  {"a": [1, 2]}'],
    ['rtf', '{\\rtf1\\ansi hi}'],
  ])('identifies %s', (expected, text) => {
    expect(sniffText(text)).toBe(expected)
  })
  it('does not call broken JSON JSON', () => {
    expect(sniffText('{ not json')).toBeNull()
  })
})

describe('filename and MIME mapping', () => {
  it('prefers the longest extension', () => {
    expect(formatFromFilename('backup.tar.gz')?.id).toBe('tgz')
    expect(formatFromFilename('notes.GZ')?.id).toBe('gz')
    expect(formatFromFilename('IMG_0001.HEIC')?.id).toBe('heic')
    expect(formatFromFilename('photo.jpeg')?.id).toBe('jpeg')
    expect(formatFromFilename('noext')).toBeUndefined()
  })
  it('maps MIME types and ignores octet-stream', () => {
    expect(formatFromMime('image/png')?.id).toBe('png')
    expect(formatFromMime('text/csv; charset=utf-8')?.id).toBe('csv')
    expect(formatFromMime('application/octet-stream')).toBeUndefined()
  })
  it('extracts extensions', () => {
    expect(extensionOf('a.tar.gz')).toBe('tar.gz')
    expect(extensionOf('.hidden')).toBe('')
    expect(extensionOf('Report.PDF')).toBe('pdf')
  })
  it('treats container aliases as compatible', () => {
    expect(isAlias('mp4', 'mov')).toBe(true)
    expect(isAlias('zip', 'docx')).toBe(true)
    expect(isAlias('png', 'jpeg')).toBe(false)
  })
})

describe('detectFile on real fixtures', () => {
  it.each([
    ['alpha.png', 'png'],
    ['photo.jpg', 'jpeg'],
    ['report.docx', 'docx'],
    ['book.xlsx', 'xlsx'],
    ['deck.pptx', 'pptx'],
    ['bundle.zip', 'zip'],
    ['bundle.tar.gz', 'tgz'],
    ['text.pdf', 'pdf'],
    ['tone.wav', 'wav'],
    ['clip.mp4', 'mp4'],
    ['clip.mov', 'mov'],
    ['notes.md', 'md'],
    ['people.csv', 'csv'],
    ['records.json', 'json'],
    ['config.yaml', 'yaml'],
    ['library.xml', 'xml'],
    ['captions.srt', 'srt'],
    ['captions.vtt', 'vtt'],
    ['logo.svg', 'svg'],
    ['page.html', 'html'],
  ])('%s → %s', async (name, expected) => {
    const d = await detectFile(file(name))
    expect(d.formatId).toBe(expected)
    expect(d.mismatch).toBeUndefined()
  })

  it('flags a PNG renamed to .jpg', async () => {
    const d = await detectFile(file('renamed.jpg', 'image/jpeg'))
    expect(d.formatId).toBe('png')
    expect(d.source).toBe('signature')
    expect(d.mismatch).toEqual({ claimed: 'jpeg', actual: 'png' })
  })

  it('identifies a tarball inside an unlabelled gzip', async () => {
    const d = await detectFile(new File([fx('bundle.tar.gz')], 'download.gz'))
    expect(d.formatId).toBe('tgz')
  })

  it('does not trust a binary extension without a signature', async () => {
    const d = await detectFile(new File([new Uint8Array([1, 2, 3, 0, 5, 6, 0, 0])], 'fake.mp4'))
    expect(d.formatId).toBeNull()
  })

  it('identifies extensionless text by content', async () => {
    const d = await detectFile(new File(['WEBVTT\n\n00:00.000 --> 00:01.000\nhi'], 'subs'))
    expect(d.formatId).toBe('vtt')
    expect(d.source).toBe('content')
  })
})
