import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, addFiles, ascii, chooseTarget, convertAndWait, download, errorText, exif, fixture } from './helpers'

const abuse = (name: string) => path.join('abuse', name)

function withExt(p: string, ext: string) {
  const target = path.join(mkdtempSync(path.join(tmpdir(), 'ce-')), `out${ext}`)
  copyFileSync(p, target)
  return target
}

/** Tags that identify a person, place or device. None may survive a privacy-preserving conversion. */
const IDENTIFYING = /GPS|Make$|Model$|Artist|Creator|Comment|SerialNumber|OwnerName/i

function identifyingTags(file: string) {
  return Object.entries(exif(file))
    .filter(([k]) => IDENTIFYING.test(k.split(':').pop() ?? ''))
    .filter(([k]) => !/^(File|System|ExifTool|Composite):/.test(k))
}

/**
 * Writes every JPEG stream embedded in a PDF to its own file. pdfimages is not used because it
 * rewrites the stream and would hide the EXIF block the check is looking for.
 */
function embeddedJpegs(pdf: Uint8Array): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'ce-pdfjpg-'))
  const buf = Buffer.from(pdf)
  const files: string[] = []
  for (let i = buf.indexOf('ffd8ff', 0, 'hex'); i >= 0; i = buf.indexOf('ffd8ff', i + 2, 'hex')) {
    const end = buf.indexOf('ffd9', i, 'hex')
    if (end < 0) break
    const file = path.join(dir, `stream-${files.length}.jpg`)
    writeFileSync(file, buf.subarray(i, end + 2))
    files.push(file)
    i = end
  }
  return files
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('damaged and hostile inputs fail clearly, never with a fake file', () => {
  test('an empty file is declined and does not block other files', async ({ page }) => {
    await addFiles(page, [abuse('empty.png'), 'alpha.png'])
    const empty = page.getByTestId('file-card').first()
    await expect(empty).toHaveAttribute('data-status', /unsupported|failed/)
    await expect(empty.getByTestId('download-link')).toHaveCount(0)
    await expect(empty).toContainText('empty (0 bytes)')
    await chooseTarget(page, 1, 'image-to-webp')
    await page.getByTestId('convert-all').click()
    await expect(page.getByTestId('file-card').nth(1)).toHaveAttribute('data-status', 'completed', { timeout: 60_000 })
    expect(ascii((await download(page, 1)).bytes, 8, 4)).toBe('WEBP')
  })

  test('a corrupt PDF reports damage instead of producing output', async ({ page }) => {
    await addFiles(page, [abuse('corrupt.pdf')])
    const card = page.getByTestId('file-card').first()
    if ((await card.getAttribute('data-status')) === 'unsupported') return
    await chooseTarget(page, 0, 'pdf-to-txt')
    await convertAndWait(page)
    expect(await errorText(page, 0)).toMatch(/damaged|could not be read|invalid/i)
    await expect(card.getByTestId('download-link')).toHaveCount(0)
  })

  test('a ZIP renamed to .docx is not treated as a Word document', async ({ page }) => {
    await addFiles(page, [abuse('not-really.docx')])
    const card = page.getByTestId('file-card').first()
    await expect(card.getByTestId('detected-format')).not.toHaveText('DOCX')
  })

  test('legacy .doc is declined with an explanation', async ({ page }) => {
    await addFiles(page, [abuse('legacy.doc')])
    const card = page.getByTestId('file-card').first()
    await expect(card).toHaveAttribute('data-status', 'unsupported')
    await expect(card.getByTestId('format-picker')).toHaveCount(0)
  })

  for (const [file, pattern] of [
    ['truncated.zip', /damaged|could not be read/i],
    ['lying-size.zip', /damaged|does not match|corrupt/i],
    ['bad-crc.zip', /damaged|does not match|corrupt/i],
    ['bomb.zip', /safety|decompression bomb|expands/i],
    ['encrypted.zip', /password/i],
  ] as const) {
    test(`archive: ${file} is refused`, async ({ page }) => {
      await addFiles(page, [abuse(file)])
      const card = page.getByTestId('file-card').first()
      if ((await card.getAttribute('data-status')) === 'unsupported') {
        expect(file, 'only a truncated ZIP may be undetectable').toBe('truncated.zip')
        return
      }
      await chooseTarget(page, 0, 'archive-extract')
      await convertAndWait(page)
      expect(await errorText(page, 0)).toMatch(pattern)
      await expect(card.getByTestId('download-link')).toHaveCount(0)
    })
  }

  test('archive: password-protected 7z is refused', async ({ page }) => {
    await addFiles(page, [abuse('encrypted.7z')])
    await chooseTarget(page, 0, 'archive-extract-7z')
    await convertAndWait(page)
    expect(await errorText(page, 0)).toMatch(/password|encrypt|could not be read|damaged/i)
    await expect(page.getByTestId('download-link')).toHaveCount(0)
  })

  test('password-protected PDF is refused for text and image output', async ({ page }) => {
    await addFiles(page, [abuse('encrypted.pdf'), abuse('encrypted.pdf')])
    await chooseTarget(page, 0, 'pdf-to-txt')
    await chooseTarget(page, 1, 'pdf-to-png')
    await convertAndWait(page, 2)
    for (const i of [0, 1]) expect(await errorText(page, i)).toMatch(/password/i)
    await expect(page.getByTestId('download-link')).toHaveCount(0)
  })

  for (const [file, id] of [
    ['secret-broken.json', 'data-to-yaml'],
    ['secret-broken.yaml', 'data-to-json'],
    ['secret-broken.xml', 'data-to-json'],
  ] as const) {
    test(`syntax errors in ${file} do not echo file contents`, async ({ page }) => {
      await addFiles(page, [abuse(file)])
      await chooseTarget(page, 0, id)
      await convertAndWait(page)
      const msg = await errorText(page, 0)
      expect(msg).toMatch(/not valid/i)
      expect(msg).not.toContain('sk-LEAK')
      expect(msg).not.toContain('jane')
    })
  }
})

test.describe('TAR integrity', () => {
  for (const file of ['truncated.tar', 'bad-checksum.tar']) {
    test(`archive: ${file} is refused instead of extracting partial data`, async ({ page }) => {
      await addFiles(page, [abuse(file)])
      const card = page.getByTestId('file-card').first()
      await chooseTarget(page, 0, 'archive-extract')
      await convertAndWait(page)
      expect(await errorText(page, 0)).toMatch(/damaged|incomplete|checksum/i)
      await expect(card.getByTestId('download-link')).toHaveCount(0)
    })
  }
})

test.describe('document and data edge cases', () => {
  test('Markdown → HTML output loads nothing remote when the saved file is opened', async ({ page }) => {
    await addFiles(page, [abuse('remote-media.md')])
    await chooseTarget(page, 0, 'md-to-html')
    await convertAndWait(page)
    const html = (await download(page, 0)).bytes.toString('utf8')
    expect(html).not.toContain('tracker.example')
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('cell')
  })

  test('inline SVGs without a size do not break Markdown → PDF', async ({ page }) => {
    await addFiles(page, [abuse('svg-nosize.md')])
    await chooseTarget(page, 0, 'md-to-pdf')
    await convertAndWait(page)
    const pdf = await download(page, 0)
    expect(ascii(pdf.bytes, 0, 5)).toBe('%PDF-')
  })

  test('XML → JSON keeps leading zeros and still parses ordinary numbers', async ({ page }) => {
    await addFiles(page, [abuse('postcodes.xml')])
    await chooseTarget(page, 0, 'data-to-json')
    await convertAndWait(page)
    const json = JSON.parse((await download(page, 0)).bytes.toString('utf8'))
    expect(json.places.place).toEqual({ zip: '02134', n: 12, rate: 0.5 })
  })

  test('a YAML alias bomb is refused with an accurate reason', async ({ page }) => {
    await addFiles(page, [abuse('alias-bomb.yaml')])
    await chooseTarget(page, 0, 'data-to-json')
    await convertAndWait(page)
    const err = await errorText(page, 0)
    expect(err).toMatch(/expands too much/i)
    expect(err).not.toMatch(/syntax/i)
  })
})

test.describe('metadata removal', () => {
  test('JPEG: "Remove metadata" and WebP conversion drop GPS, camera, author and comments', async ({ page }) => {
    expect(identifyingTags(fixture(abuse('gps.jpg'))).length).toBeGreaterThan(3)
    await addFiles(page, [abuse('gps.jpg'), abuse('gps.jpg')])
    await expect(page.getByTestId('file-card').first()).toContainText('GPS location')
    await chooseTarget(page, 0, 'image-strip-metadata')
    await chooseTarget(page, 1, 'image-to-webp')
    await convertAndWait(page, 2)
    const stripped = await download(page, 0)
    expect([stripped.bytes[0], stripped.bytes[1]]).toEqual([0xff, 0xd8])
    expect(identifyingTags(withExt(stripped.path, '.jpg'))).toEqual([])
    const webp = await download(page, 1)
    expect(ascii(webp.bytes, 8, 4)).toBe('WEBP')
    expect(identifyingTags(withExt(webp.path, '.webp'))).toEqual([])
  })

  test('JPEG → PDF and "images → one PDF" keep no GPS, camera or author data in the embedded photos', async ({ page }) => {
    expect(identifyingTags(fixture(abuse('gps-rotated.jpg'))).length).toBeGreaterThan(3)
    await addFiles(page, [abuse('gps.jpg'), abuse('gps-rotated.jpg')])
    await chooseTarget(page, 0, 'image-to-pdf')
    await chooseTarget(page, 1, 'image-to-pdf')
    await page.getByRole('button', { name: '2 images → one PDF' }).click()
    await expect(page.getByTestId('file-card')).toHaveCount(3)
    await convertAndWait(page, 3)
    for (let i = 0; i < 3; i++) {
      const pdf = await download(page, i)
      expect(ascii(pdf.bytes, 0, 5)).toBe('%PDF-')
      const streams = embeddedJpegs(pdf.bytes)
      expect(streams.length, `card ${i} embeds at least one JPEG`).toBeGreaterThan(0)
      for (const s of streams) expect(identifyingTags(s), `card ${i} ${path.basename(s)}`).toEqual([])
    }
  })

  test('PNG: "Remove metadata" drops eXIf and text chunks and keeps transparency', async ({ page }) => {
    expect(identifyingTags(fixture(abuse('gps.png'))).length).toBeGreaterThan(1)
    await addFiles(page, [abuse('gps.png')])
    await chooseTarget(page, 0, 'image-strip-metadata')
    await convertAndWait(page)
    const out = await download(page, 0)
    const file = withExt(out.path, '.png')
    expect(identifyingTags(file)).toEqual([])
    const tags = exif(file)
    expect(tags['PNG:ColorType']).toMatch(/Alpha/)
    expect(tags['PNG:ImageWidth']).toBe(320)
  })
})

test('a 24-megapixel image converts at full size on desktop and is scaled with a warning on iPhone', async ({ page }, info) => {
  await addFiles(page, [abuse('huge-24mp.png')])
  await chooseTarget(page, 0, 'image-to-jpeg')
  await convertAndWait(page)
  const card = page.getByTestId('file-card').first()
  await expect(card).toHaveAttribute('data-status', 'completed')
  const out = await download(page, 0)
  const tags = exif(withExt(out.path, '.jpg'))
  const w = Number(tags['File:ImageWidth'])
  const h = Number(tags['File:ImageHeight'])
  expect(w / h).toBeCloseTo(1.5, 2)
  if (info.project.name === 'webkit-iphone') {
    expect(w * h).toBeLessThanOrEqual(16_777_216)
    await expect(card).toContainText(/scaled|reduced|megapixel/i)
  } else {
    expect([w, h]).toEqual([6000, 4000])
  }
})

test('unusual file names: emoji, Unicode, HTML, reserved and very long names', async ({ page }) => {
  let dialogs = 0
  page.on('dialog', async (d) => {
    dialogs++
    await d.dismiss()
  })
  const png = readFileSync(fixture('alpha.png'))
  const names = [
    '📷 Fotoğraf — ünïcødé 日本語.png',
    '<img src=x onerror=alert(1)>.png',
    `${'very-long-name-'.repeat(17)}end.png`,
    'CON.png',
    'a:b|c?d*e"f.png',
  ]
  await page.setInputFiles('[data-testid=file-input]', names.map((name) => ({ name, mimeType: 'image/png', buffer: png })))
  const cards = page.getByTestId('file-card')
  await expect(cards).toHaveCount(names.length)
  await expect(cards.nth(1)).toContainText('<img src=x onerror=alert(1)>')
  for (let i = 0; i < names.length; i++) {
    await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
    await chooseTarget(page, i, 'image-to-webp')
  }
  await convertAndWait(page, names.length)
  const outNames: string[] = []
  for (let i = 0; i < names.length; i++) {
    const out = await download(page, i)
    expect(ascii(out.bytes, 8, 4)).toBe('WEBP')
    expect(out.mime).toBe('image/webp')
    expect(out.name).toMatch(/\.webp$/)
    expect(out.name).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/)
    expect(out.name.length).toBeLessThanOrEqual(200)
    outNames.push(out.name)
  }
  // The link keeps the real name. WebKit then rewrites spaces when it saves the file.
  expect(await cards.nth(0).getByTestId('download-link').getAttribute('download')).toBe('📷 Fotoğraf — ünïcødé 日本語.webp')
  expect(outNames[0].replaceAll('_', ' ')).toBe('📷 Fotoğraf — ünïcødé 日本語.webp')
  expect(dialogs).toBe(0)
})

async function tapRepeatedly(page: import('@playwright/test').Page, target: import('@playwright/test').Locator, taps: number) {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  for (let i = 0; i < taps; i++) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(90)
  }
}

test('rapid repeated taps on Convert start each file once and never cancel it', async ({ page }) => {
  await addFiles(page, ['large.png', 'photo.jpg', 'opaque.png'])
  await chooseTarget(page, 0, 'image-to-avif')
  for (let i = 1; i < 3; i++) await chooseTarget(page, i, 'image-to-webp')
  await tapRepeatedly(page, page.getByTestId('convert-all'), 4)
  for (let i = 0; i < 3; i++) {
    const card = page.getByTestId('file-card').nth(i)
    await expect(card).toHaveAttribute('data-status', 'completed', { timeout: 90_000 })
    await expect(card.getByTestId('result-row')).toHaveCount(1)
  }
})

test('double-tapping "Convert again" on a stopped file does not stop it a second time', async ({ page }) => {
  await addFiles(page, ['large.png'])
  await chooseTarget(page, 0, 'image-to-avif')
  await page.getByTestId('convert-all').click()
  const card = page.getByTestId('file-card').first()
  // The bottom bar is what a thumb can reach; the in-card Stop sits behind it on a phone.
  await page.getByRole('button', { name: 'Stop all' }).click()
  await expect(card).toHaveAttribute('data-status', 'canceled')
  // A second tap lands where Convert just was, which is now Stop.
  await tapRepeatedly(page, page.getByTestId('convert-all'), 2)
  await expect(card).toHaveAttribute('data-status', 'completed', { timeout: 90_000 })
})

test('twelve files of mixed types convert together and every output is valid', async ({ page }) => {
  test.setTimeout(180_000)
  const jobs: [string, string, (b: Buffer) => void][] = [
    ['alpha.png', 'image-to-webp', (b) => expect(ascii(b, 8, 4)).toBe('WEBP')],
    ['photo.jpg', 'image-to-png', (b) => expect(ascii(b, 1, 3)).toBe('PNG')],
    ['opaque.png', 'image-to-jpeg', (b) => expect([b[0], b[1]]).toEqual([0xff, 0xd8])],
    ['sign.png', 'image-to-avif', (b) => expect(ascii(b, 4, 8)).toBe('ftypavif')],
    ['alpha.png', 'image-to-gif', (b) => expect(ascii(b, 0, 4)).toBe('GIF8')],
    ['photo.jpg', 'image-to-pdf', (b) => expect(ascii(b, 0, 5)).toBe('%PDF-')],
    ['notes.md', 'md-to-html', (b) => expect(b.toString()).toContain('<h1')],
    ['people.csv', 'sheet-to-xlsx', (b) => expect(ascii(b, 0, 2)).toBe('PK')],
    ['records.json', 'data-to-yaml', (b) => expect(b.toString()).toContain('name: Bob')],
    ['captions.srt', 'subs-to-vtt', (b) => expect(b.toString()).toMatch(/^WEBVTT/)],
    ['plain.txt', 'file-to-gzip', (b) => expect([b[0], b[1]]).toEqual([0x1f, 0x8b])],
    ['text.pdf', 'pdf-to-txt', (b) => expect(b.length).toBeGreaterThan(10)],
  ]
  await addFiles(page, jobs.map((j) => j[0]))
  for (let i = 0; i < jobs.length; i++) await chooseTarget(page, i, jobs[i][1])
  await convertAndWait(page, jobs.length)
  for (let i = 0; i < jobs.length; i++) {
    await expect(page.getByTestId('file-card').nth(i), jobs[i][1]).toHaveAttribute('data-status', 'completed')
    jobs[i][2]((await download(page, i)).bytes)
  }
})

test('stopping a video conversion midway leaves no output, and clearing during work recovers', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'FFmpeg cancellation is covered in Chromium and WebKit')
  await addFiles(page, [abuse('long.mp4')])
  await chooseTarget(page, 0, 'video-to-webm')
  await page.getByTestId('convert-all').click()
  const card = page.getByTestId('file-card').first()
  await expect(card).toHaveAttribute('data-status', /loading-engine|processing/)
  await card.getByRole('button', { name: 'Stop' }).click()
  await expect(card).toHaveAttribute('data-status', 'canceled')
  await expect(card.getByTestId('download-link')).toHaveCount(0)

  await card.getByRole('button', { name: 'Convert again' }).click()
  await expect(card).toHaveAttribute('data-status', /loading-engine|processing/)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByTestId('file-card')).toHaveCount(0)

  await addFiles(page, ['alpha.png'])
  await chooseTarget(page, 0, 'image-to-webp')
  await convertAndWait(page)
  await expect(page.getByTestId('file-card').first()).toHaveAttribute('data-status', 'completed')
})

test.describe('without the offline cache', () => {
  // The service worker would serve engines from its cache and bypass the simulated network failures.
  test.use({ serviceWorkers: 'block' })

test('engine download failures are explained and recoverable', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit does not route requests made from inside workers')
  // AVIF has no native canvas encoder to fall back on, so a missing encoder must surface as an error.
  await page.route('**/assets/image-encoder.worker-*.js', (r) => r.abort())
  await page.route('**/assets/avif_enc*', (r) => r.abort())
  await page.route('**/vendor/ffmpeg/**', (r) => r.abort())
  await addFiles(page, ['alpha.png', 'tone.wav'])
  await chooseTarget(page, 0, 'image-to-avif')
  await chooseTarget(page, 1, 'audio-to-mp3')
  await convertAndWait(page, 2)
  for (const i of [0, 1]) {
    const msg = await errorText(page, i)
    expect(msg).toMatch(/could not|stopped|failed|load/i)
    await expect(page.getByTestId('file-card').nth(i).getByTestId('download-link')).toHaveCount(0)
  }
  await page.unrouteAll({ behavior: 'wait' })
  for (const i of [0, 1]) await page.getByTestId('file-card').nth(i).getByRole('button', { name: 'Retry' }).click()
  for (const i of [0, 1]) await expect(page.getByTestId('file-card').nth(i)).toHaveAttribute('data-status', 'completed', { timeout: 90_000 })
  expect(ascii((await download(page, 0)).bytes, 4, 8)).toBe('ftypavif')
  const mp3 = (await download(page, 1)).bytes
  expect(ascii(mp3, 0, 3) === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)).toBe(true)
})
})

test('reloading mid-conversion returns to a clean, working page', async ({ page }) => {
  await addFiles(page, ['large.png'])
  await chooseTarget(page, 0, 'image-to-avif')
  await page.getByTestId('convert-all').click()
  await expect(page.getByTestId('file-card').first()).toHaveAttribute('data-status', /preparing|loading-engine|processing/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Convert Everything' })).toBeVisible()
  await expect(page.getByTestId('file-card')).toHaveCount(0)
  await addFiles(page, ['alpha.png'])
  await chooseTarget(page, 0, 'image-to-png')
  await convertAndWait(page)
  expect(ascii((await download(page, 0)).bytes, 1, 3)).toBe('PNG')
})
