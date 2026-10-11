import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '../e2e/helpers'

/**
 * Audit matrix: drives each conversion through the real UI with independently generated fixtures
 * (AUDIT_FX) and saves every output plus a JSON record (AUDIT_OUT) for inspection with external tools.
 * It deliberately asserts little; the verdict comes from the external validator.
 */
const FX = process.env.AUDIT_FX ?? ''
const OUT = process.env.AUDIT_OUT ?? ''
const REPO_FX = path.join(import.meta.dirname, '..', 'fixtures')

const cases: [string, string][] = [
  ...['webp', 'png', 'jpeg', 'avif', 'gif', 'bmp', 'tiff', 'ico', 'svg-wrapper', 'pdf'].map((t): [string, string] => ['quad.png', `image-to-${t}`]),
  ['quad.bmp', 'image-to-png'], ['quad.tiff', 'image-to-png'], ['quad.webp', 'image-to-png'], ['quad.ico', 'image-to-png'],
  ['anim.gif', 'image-to-png'], ['anim.gif', 'image-to-webp'],
  ['oriented-gps.jpg', 'image-to-png'], ['oriented-gps.jpg', 'image-to-webp'], ['oriented-gps.jpg', 'image-strip-metadata'], ['oriented-gps.jpg', 'image-to-pdf'],
  ['remote.svg', 'image-to-png'], ['@photo.heic', 'image-to-jpeg'], ['@sign.png', 'image-ocr'],
  ['doc.md', 'md-to-html'], ['doc.md', 'md-to-pdf'], ['doc.md', 'md-to-txt'],
  ['page.html', 'html-to-md'], ['page.html', 'html-to-pdf'], ['page.html', 'html-to-txt'],
  ['plain.txt', 'txt-to-pdf'], ['plain.txt', 'txt-to-html'], ['cp1252.txt', 'txt-reencode'], ['plain.txt', 'file-to-gzip'],
  ['three.pdf', 'pdf-to-txt'], ['three.pdf', 'pdf-to-png'], ['three.pdf', 'pdf-to-jpeg'], ['three.pdf', 'pdf-extract-pages'], ['three.pdf', 'pdf-strip-metadata'],
  ['@scanned.pdf', 'pdf-ocr'],
  ['doc.docx', 'docx-to-html'], ['doc.docx', 'docx-to-md'], ['doc.docx', 'docx-to-txt'], ['doc.docx', 'docx-to-pdf'], ['doc.docx', 'docx-extract-media'],
  ['deck.pptx', 'pptx-to-txt'], ['deck.pptx', 'pptx-extract-media'],
  ['inject.csv', 'sheet-to-xlsx'], ['inject.csv', 'sheet-to-csv'], ['inject.csv', 'sheet-to-json'], ['inject.csv', 'sheet-to-ods'], ['inject.csv', 'sheet-to-tsv'],
  ['book.xlsx', 'sheet-to-csv'], ['book.xlsx', 'sheet-to-json'], ['book.xlsx', 'sheet-to-ods'], ['book-cached.xlsx', 'sheet-to-ods'], ['book-cached.xlsx', 'sheet-to-xlsx'], ['book-cached.xlsx', 'sheet-to-csv'],
  ['rows.json', 'sheet-to-csv'], ['rows.json', 'sheet-to-xlsx'], ['data.json', 'data-to-yaml'], ['data.json', 'data-to-xml'],
  ['conf.yaml', 'data-to-json'], ['lol.yaml', 'data-to-json'], ['data.xml', 'data-to-json'], ['xxe.xml', 'data-to-json'], ['subs.srt', 'subs-to-vtt'],
  ['nested.zip', 'archive-extract'], ['nested.zip', 'archive-to-zip'], ['nested.tar.gz', 'archive-extract'], ['nested.tar.gz', 'archive-to-zip'],
  ['plain.tar', 'archive-extract'], ['truncated.tar', 'archive-extract'], ['truncated.tar.gz', 'archive-extract'], ['hello.txt.gz', 'archive-extract'],
  ['nested.7z', 'archive-extract-7z'],
  ...['mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'aiff'].map((t): [string, string] => ['stereo.wav', `audio-to-${t}`]),
  ['tone.mp3', 'audio-to-wav'], ['tone.flac', 'audio-to-mp3'],
  ['clip.mp4', 'video-to-webm'], ['clip.mp4', 'video-to-mov'], ['clip.mp4', 'video-to-mkv'], ['clip.mp4', 'video-to-gif'], ['clip.mp4', 'video-thumbnail'], ['clip.mp4', 'audio-to-m4a'],
  ['clip.webm', 'video-to-mp4'],
  ['really-png.pdf', 'image-to-jpeg'], ['text-named.png', 'txt-to-pdf'], ['html-named.txt', 'txt-to-html'],
]

for (const [file, conv] of cases) {
  test(`matrix ${file} -> ${conv}`, async ({ page }, info) => {
    test.skip(!FX || !OUT, 'AUDIT_FX / AUDIT_OUT not set')
    const dir = path.join(OUT, info.project.name, `${file.replace('@', '')}__${conv}`)
    mkdirSync(dir, { recursive: true })
    const src = file.startsWith('@') ? path.join(REPO_FX, file.slice(1)) : path.join(FX, file)
    const record: Record<string, unknown> = { file, conv, project: info.project.name }
    await page.goto('/')
    await page.setInputFiles('[data-testid=file-input]', src)
    const card = page.getByTestId('file-card').first()
    await expect(card).not.toHaveAttribute('data-status', 'detecting')
    record.detected = (await card.getByTestId('detected-format').innerText().catch(() => '')).trim()
    record.initialStatus = await card.getAttribute('data-status')
    const picker = card.getByTestId('format-picker')
    if (!(await picker.count())) {
      record.offered = []
      record.result = 'no-picker'
      record.cardText = (await card.innerText()).slice(0, 600)
      writeFileSync(path.join(dir, 'record.json'), JSON.stringify(record, null, 2))
      return
    }
    await picker.click()
    const offered = await page.locator('[data-testid^=target-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(7)))
    record.offered = offered
    if (!offered.includes(conv)) {
      record.result = 'not-offered'
      await page.keyboard.press('Escape')
      writeFileSync(path.join(dir, 'record.json'), JSON.stringify(record, null, 2))
      return
    }
    await page.getByTestId(`target-${conv}`).click()
    await expect(page.getByTestId(`target-${conv}`)).toBeHidden()
    const t0 = Date.now()
    await page.getByTestId('convert-all').click()
    await expect(card).toHaveAttribute('data-status', /completed|failed|canceled/, { timeout: 110_000 })
    record.ms = Date.now() - t0
    record.result = await card.getAttribute('data-status')
    record.cardText = (await card.innerText()).slice(0, 1500)
    const links = card.getByTestId('download-link')
    const n = await links.count()
    const outs = []
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(200)
      const link = links.nth(i)
      const name = await link.getAttribute('download')
      const meta = await link.evaluate(async (a: HTMLAnchorElement) => {
        const b = await (await fetch(a.href)).blob()
        const buf = new Uint8Array(await b.arrayBuffer())
        let bin = ''
        for (let j = 0; j < buf.length; j += 0x8000) bin += String.fromCharCode(...buf.subarray(j, j + 0x8000))
        return { type: b.type, size: b.size, b64: btoa(bin) }
      })
      const fname = `${String(i).padStart(2, '0')}_${(name ?? 'out').replace(/[/\\]/g, '_')}`
      writeFileSync(path.join(dir, fname), Buffer.from(meta.b64, 'base64'))
      outs.push({ name, mime: meta.type, size: meta.size, saved: fname })
    }
    record.outputs = outs
    writeFileSync(path.join(dir, 'record.json'), JSON.stringify(record, null, 2))
  })
}


