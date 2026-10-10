import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'
import YAML from 'yaml'
import { addFiles, ascii, chooseTarget, convertAndWait, download, probe } from './helpers'

type Check = (out: { name: string; bytes: Buffer; path: string }) => void

/** Each row: input fixture, conversion id, check on the downloaded output. */
const CASES: [string, string, Check][] = [
  ['text.pdf', 'pdf-to-jpeg', (o) => expect([o.bytes[0], o.bytes[1]]).toEqual([0xff, 0xd8])],
  ['text.pdf', 'pdf-strip-metadata', (o) => expect(execFileSync('pdfinfo', [withExt(o.path, '.pdf')], { encoding: 'utf8' })).not.toContain('Fixture Author')],
  ['book.xlsx', 'sheet-to-ods', (o) => expect(XLSX.read(o.bytes).SheetNames).toEqual(['Sales', 'Notes'])],
  ['book.xlsx', 'sheet-to-json', (o) => expect(JSON.parse(o.bytes.toString())[0]).toMatchObject({ Product: 'Widget', Units: 10, SKU: '00123' })],
  ['simple.tsv', 'sheet-to-csv', (o) => expect(o.bytes.toString()).toBe('a,b\r\n1,2\r\n')],
  ['records.json', 'sheet-to-xlsx', (o) => expect(XLSX.utils.sheet_to_json(XLSX.read(o.bytes).Sheets.Sheet1)[1]).toMatchObject({ id: 2, name: 'Bob', active: true })],
  ['records.json', 'data-to-yaml', (o) => expect(YAML.parse(o.bytes.toString())[0].tags).toEqual(['x', 'y'])],
  ['config.yaml', 'data-to-xml', (o) => expect(o.bytes.toString()).toMatch(/<host>localhost<\/host>/)],
  ['captions.vtt', 'subs-to-srt', (o) => expect(o.bytes.toString()).toContain('1\n00:00:01,000 --> 00:00:03,500\nHello')],
  ['report.docx', 'docx-to-md', (o) => expect(o.bytes.toString()).toMatch(/^# Quarterly Report/m)],
  ['report.docx', 'docx-extract-media', (o) => expect(ascii(o.bytes, 1, 3)).toBe('PNG')],
  ['deck.pptx', 'pptx-extract-media', (o) => expect(ascii(o.bytes, 1, 3)).toBe('PNG')],
  ['notes.md', 'md-to-txt', (o) => expect(o.bytes.toString()).toContain('• New WebP encoder')],
  ['plain.txt', 'txt-to-html', (o) => expect(o.bytes.toString()).toContain('<p>Plain text document.<br>')],
  ['latin1.txt', 'txt-reencode', (o) => expect(o.bytes.toString('utf8')).toContain('Café crème brûlée')],
  ['bundle.tar.gz', 'archive-to-zip', (o) => expect(execFileSync('unzip', ['-l', withExt(o.path, '.zip')], { encoding: 'utf8' })).toContain('project/sub/deep.txt')],
  ['alpha.png', 'image-to-svg-wrapper', (o) => expect(o.bytes.toString()).toMatch(/<svg[\s\S]*data:image\/png;base64/)],
  ['alpha.png', 'image-strip-metadata', (o) => expect(ascii(o.bytes, 1, 3)).toBe('PNG')],
  ['page.html', 'html-to-txt', (o) => expect(o.bytes.toString()).toContain('• First')],
  ['plain.txt', 'file-to-gzip', (o) => expect(execFileSync('gzip', ['-dc', withExt(o.path, '.gz')], { encoding: 'utf8' })).toContain('café résumé')],
]

const MEDIA: [string, string, string][] = [
  ['tone.wav', 'audio-to-ogg', 'vorbis'],
  ['tone.wav', 'audio-to-opus', 'opus'],
  ['tone.wav', 'audio-to-m4a', 'aac'],
  ['tone.wav', 'audio-to-aac', 'aac'],
  ['tone.wav', 'audio-to-aiff', 'pcm_s16be'],
  ['clip.mp4', 'audio-to-wav', 'pcm_s16le'],
  ['stereo.mp4', 'video-to-webm', 'vp8'],
  ['clip.mp4', 'video-thumbnail', 'mjpeg'],
  ['clip.mov', 'video-to-mkv', 'h264'],
]

function withExt(p: string, ext: string) {
  // Some CLI tools insist on a file extension.
  const dir = mkdtempSync(path.join(tmpdir(), 'ce-'))
  const target = path.join(dir, `out${ext}`)
  copyFileSync(p, target)
  return target
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('sweep: documents, data, archives and images', async ({ page }) => {
  test.setTimeout(180_000)
  await addFiles(page, CASES.map((c) => c[0]))
  for (let i = 0; i < CASES.length; i++) await chooseTarget(page, i, CASES[i][1])
  await convertAndWait(page, CASES.length)
  for (let i = 0; i < CASES.length; i++) {
    await expect(page.getByTestId('file-card').nth(i), CASES[i][1]).toHaveAttribute('data-status', 'completed')
    const out = await download(page, i)
    CASES[i][2](out)
  }
})

test('sweep: remaining audio/video targets', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'FFmpeg sweep runs in Chromium and WebKit; core media paths are covered in Firefox by media.spec')
  test.setTimeout(300_000)
  await addFiles(page, MEDIA.map((c) => c[0]))
  for (let i = 0; i < MEDIA.length; i++) await chooseTarget(page, i, MEDIA[i][1])
  await convertAndWait(page, MEDIA.length)
  for (let i = 0; i < MEDIA.length; i++) {
    await expect(page.getByTestId('file-card').nth(i), MEDIA[i][1]).toHaveAttribute('data-status', 'completed')
    const out = await download(page, i)
    expect(probe(out.path).map((s) => s.codec_name), MEDIA[i][1]).toContain(MEDIA[i][2])
  }
})
