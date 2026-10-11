import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, chooseTarget } from '../e2e/helpers'

/** Audit: bounded stress cases. Records outcome, timing and crashes rather than asserting a fixed answer. */
const ST = process.env.AUDIT_STRESS ?? ''
const FX = process.env.AUDIT_FX ?? ''
const OUT = process.env.AUDIT_OUT ?? ''

const cases: [string, string][] = [
  ['px16k.png', 'image-to-webp'],
  ['px16k.png', 'image-to-jpeg'],
  ['px40k.png', 'image-to-jpeg'],
  ['huge.svg', 'image-to-png'],
  ['honest-1200m.zip', 'archive-extract'],
  ['ratio-60m.zip', 'archive-extract'],
  ['bomb1200m.gz', 'archive-extract'],
  ['many.zip', 'archive-extract'],
  ['nested-bomb.zip', 'archive-extract'],
  ['@bomb300m.gz', 'archive-extract'],
]

function save(project: string, name: string, rec: unknown) {
  const dir = path.join(OUT, project, 'stress')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rec, null, 2))
}

for (const [file, conv] of cases) {
  test(`stress ${file} -> ${conv}`, async ({ page }, info) => {
    test.skip(!ST || !OUT, 'AUDIT_STRESS / AUDIT_OUT not set')
    test.setTimeout(240_000)
    let crashed = false
    page.on('crash', () => (crashed = true))
    const rec: Record<string, unknown> = { file, conv }
    await page.goto('/')
    const src = file.startsWith('@') ? path.join(FX, file.slice(1)) : path.join(ST, file)
    await page.setInputFiles('[data-testid=file-input]', src)
    const card = page.getByTestId('file-card').first()
    await expect(card).not.toHaveAttribute('data-status', 'detecting', { timeout: 60_000 })
    rec.detected = await card.getByTestId('detected-format').innerText().catch(() => '')
    const picker = card.getByTestId('format-picker')
    if (await picker.count()) {
      await picker.click()
      const offered = await page.locator('[data-testid^=target-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice(7)))
      rec.offered = offered
      if (offered.includes(conv)) {
        await page.getByTestId(`target-${conv}`).click()
        const t0 = Date.now()
        await page.getByTestId('convert-all').click()
        try {
          await expect(card).toHaveAttribute('data-status', /completed|failed|canceled/, { timeout: 200_000 })
        } catch (e) {
          rec.waitError = String(e).slice(0, 300)
        }
        rec.ms = Date.now() - t0
        rec.status = crashed ? 'PAGE-CRASHED' : await card.getAttribute('data-status').catch(() => 'unknown')
        rec.cardText = crashed ? '' : (await card.innerText().catch(() => '')).slice(0, 800)
        rec.outputs = crashed ? 0 : await card.getByTestId('download-link').count()
      } else await page.keyboard.press('Escape')
    } else rec.cardText = (await card.innerText()).slice(0, 800)
    rec.crashed = crashed
    save(info.project.name, `${file.replace('@', '')}__${conv}`, rec)
  })
}

test('concurrency: 12 mixed files converted at once, then all converted again', async ({ page }, info) => {
  test.skip(!FX || !OUT, 'AUDIT_FX / AUDIT_OUT not set')
  test.setTimeout(240_000)
  await page.goto('/')
  const plan: [string, string][] = [
    ['quad.png', 'image-to-webp'], ['quad.png', 'image-to-avif'], ['oriented-gps.jpg', 'image-to-png'], ['page.html', 'html-to-pdf'],
    ['three.pdf', 'pdf-to-png'], ['doc.docx', 'docx-to-pdf'], ['book.xlsx', 'sheet-to-csv'], ['nested.zip', 'archive-extract'],
    ['nested.7z', 'archive-extract-7z'], ['stereo.wav', 'audio-to-mp3'], ['clip.mp4', 'video-to-gif'], ['data.json', 'data-to-yaml'],
  ]
  await page.setInputFiles('[data-testid=file-input]', plan.map(([f]) => path.join(FX, f)))
  const cards = page.getByTestId('file-card')
  await expect(cards).toHaveCount(plan.length)
  for (let i = 0; i < plan.length; i++) {
    await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
    await chooseTarget(page, i, plan[i][1])
  }
  const rounds = []
  for (let round = 0; round < 2; round++) {
    const t0 = Date.now()
    await page.getByTestId('convert-all').click()
    for (let i = 0; i < plan.length; i++) await expect(cards.nth(i)).toHaveAttribute('data-status', /completed|failed/, { timeout: 200_000 })
    const statuses = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
    const counts = []
    for (let i = 0; i < plan.length; i++) counts.push(await cards.nth(i).getByTestId('download-link').count())
    rounds.push({ ms: Date.now() - t0, statuses, counts })
    if (round === 0) {
      // Re-arm every card: choosing the same target again resets it to ready.
      for (let i = 0; i < plan.length; i++) await chooseTarget(page, i, plan[i][1])
    }
  }
  save(info.project.name, 'concurrency', { plan, rounds })
  for (const r of rounds) expect(r.statuses.every((s) => s === 'completed')).toBe(true)
})

test('privacy: storage after conversions holds no file names or contents; all requests same-origin GET (context-wide, incl. workers)', async ({ page, context, baseURL }, info) => {
  test.skip(!FX || !OUT, 'AUDIT_FX / AUDIT_OUT not set')
  test.setTimeout(240_000)
  const all: string[] = []
  context.on('request', (r) => all.push(`${r.method()} ${r.url()} ${r.postDataBuffer()?.length ?? 0}`))
  await page.goto('/')
  await page.waitForTimeout(1500)
  const secretName = 'SECRETNAME-Ωmega-confidential.png'
  // The fixture generator copies quad.png to this name so all three inputs can be passed as paths.
  await page.setInputFiles('[data-testid=file-input]', [path.join(FX, secretName), path.join(FX, 'three.pdf'), path.join(FX, 'stereo.wav')])
  const cards = page.getByTestId('file-card')
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
  await chooseTarget(page, 0, 'image-to-webp')
  await chooseTarget(page, 1, 'pdf-to-txt')
  await chooseTarget(page, 2, 'audio-to-mp3')
  await page.getByTestId('convert-all').click()
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveAttribute('data-status', 'completed', { timeout: 120_000 })
  const storage = await page.evaluate(async () => {
    const ls: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) ls[localStorage.key(i)!] = localStorage.getItem(localStorage.key(i)!)!
    const ss: Record<string, string> = {}
    for (let i = 0; i < sessionStorage.length; i++) ss[sessionStorage.key(i)!] = sessionStorage.getItem(sessionStorage.key(i)!)!
    const dbs = (await indexedDB.databases?.()) ?? []
    const caches_: Record<string, string[]> = {}
    for (const k of await caches.keys()) caches_[k] = (await (await caches.open(k)).keys()).map((r) => r.url)
    return { ls, ss, dbs, caches: caches_, cookie: document.cookie }
  })
  const origin = new URL(baseURL!).origin
  const offOrigin = all.filter((l) => !l.split(' ')[1].startsWith(origin) && !l.split(' ')[1].startsWith('blob:') && !l.split(' ')[1].startsWith('data:'))
  const withBody = all.filter((l) => !l.startsWith('GET ') || !l.endsWith(' 0'))
  save(info.project.name, 'privacy', { requests: all, offOrigin, withBody, storage })
  const blob = JSON.stringify(storage)
  expect(blob).not.toContain('SECRETNAME')
  expect(blob).not.toContain('three.pdf')
  expect(blob).not.toContain('PAGE1MARK')
  expect(offOrigin).toEqual([])
  expect(withBody).toEqual([])
})
