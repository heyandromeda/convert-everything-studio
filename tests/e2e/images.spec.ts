import { expect, test, addFiles, ascii, chooseTarget, convertAndWait, download, probe } from './helpers'

test.describe('image conversions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('PNG → WebP: detected as PNG, output is genuine WebP', async ({ page }) => {
    const uploads: string[] = []
    page.on('request', (r) => {
      if (['POST', 'PUT'].includes(r.method())) uploads.push(r.url())
    })
    await addFiles(page, ['alpha.png'])
    const card = page.getByTestId('file-card').first()
    await expect(card.getByTestId('detected-format')).toHaveText('PNG')
    await chooseTarget(page, 0, 'image-to-webp')
    await expect(card.getByTestId('format-picker')).toContainText('WebP')
    await convertAndWait(page)
    await expect(card).toHaveAttribute('data-status', 'completed')
    const { name, bytes, path } = await download(page, 0)
    expect(name).toBe('alpha.webp')
    expect(ascii(bytes, 0, 4)).toBe('RIFF')
    expect(ascii(bytes, 8, 4)).toBe('WEBP')
    const [stream] = probe(path)
    expect(stream.codec_name).toBe('webp')
    expect(stream.width).toBe(320)
    expect(stream.height).toBe(200)
    expect(uploads).toEqual([])
  })

  test('PNG → JPEG with background, JPEG → PNG, resize', async ({ page }) => {
    await addFiles(page, ['alpha.png', 'photo.jpg'])
    await chooseTarget(page, 0, 'image-to-jpeg')
    await chooseTarget(page, 1, 'image-to-png')
    await convertAndWait(page, 2)
    const jpg = await download(page, 0)
    expect(jpg.bytes[0]).toBe(0xff)
    expect(jpg.bytes[1]).toBe(0xd8)
    expect(probe(jpg.path)[0].codec_name).toBe('mjpeg')
    const png = await download(page, 1)
    expect(ascii(png.bytes, 1, 3)).toBe('PNG')
    expect(probe(png.path)[0].width).toBe(640)
  })

  test('resize to 50% keeps aspect ratio', async ({ page }) => {
    await addFiles(page, ['photo.jpg'])
    await chooseTarget(page, 0, 'image-to-webp')
    await page.getByLabel('Conversion settings').click()
    await page.getByLabel('Size').click()
    await page.getByRole('option', { name: 'Scale by percentage' }).click()
    await convertAndWait(page)
    const out = await download(page, 0)
    const [s] = probe(out.path)
    expect([s.width, s.height]).toEqual([320, 240])
  })

  test('image → PDF, GIF, BMP, TIFF, ICO, AVIF', async ({ page }) => {
    test.setTimeout(180_000)
    const targets: [string, (b: Buffer) => boolean][] = [
      ['image-to-pdf', (b) => ascii(b, 0, 5) === '%PDF-'],
      ['image-to-gif', (b) => ascii(b, 0, 6) === 'GIF89a'],
      ['image-to-bmp', (b) => ascii(b, 0, 2) === 'BM'],
      ['image-to-tiff', (b) => ascii(b, 0, 4) === 'II*\0' || ascii(b, 0, 4) === 'MM\0*'],
      ['image-to-ico', (b) => b[0] === 0 && b[2] === 1],
      ['image-to-avif', (b) => ascii(b, 4, 8) === 'ftypavif'],
    ]
    await addFiles(page, targets.map(() => 'opaque.png'))
    for (let i = 0; i < targets.length; i++) await chooseTarget(page, i, targets[i][0])
    await convertAndWait(page, targets.length)
    for (let i = 0; i < targets.length; i++) {
      await expect(page.getByTestId('file-card').nth(i)).toHaveAttribute('data-status', 'completed')
      const out = await download(page, i)
      expect(targets[i][1](out.bytes), `${targets[i][0]} signature`).toBe(true)
    }
  })

  test('lossless metadata removal drops the JPEG comment', async ({ page }) => {
    await addFiles(page, ['photo.jpg'])
    await chooseTarget(page, 0, 'image-strip-metadata')
    await convertAndWait(page)
    const out = await download(page, 0)
    expect(out.name).toBe('photo-clean.jpg')
    expect(out.bytes.includes(Buffer.from('Lavc'))).toBe(false)
    expect(probe(out.path)[0].width).toBe(640)
  })
})

test('HEIC → JPEG decodes natively or with the libheif fallback', async ({ page }) => {
  await page.goto('/')
  await addFiles(page, ['photo.heic'])
  const card = page.getByTestId('file-card').first()
  await expect(card.getByTestId('detected-format')).toHaveText('HEIC')
  await chooseTarget(page, 0, 'image-to-jpeg')
  await convertAndWait(page)
  await expect(card).toHaveAttribute('data-status', 'completed')
  const out = await download(page, 0)
  const [s] = probe(out.path)
  expect(s.codec_name).toBe('mjpeg')
  expect([s.width, s.height]).toEqual([480, 360])
})
