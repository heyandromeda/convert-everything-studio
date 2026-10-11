import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, chooseTarget, convertAndWait, download } from '../e2e/helpers'

/** Targeted reproductions for audit findings. Outputs are saved under AUDIT_OUT/<project>/repro. */
const FX = process.env.AUDIT_FX ?? ''
const OUT = process.env.AUDIT_OUT ?? ''
const dir = (p: string) => { const d = path.join(OUT, p, 'repro'); mkdirSync(d, { recursive: true }); return d }

test.beforeEach(async ({ page }) => { test.skip(!FX || !OUT, 'AUDIT_FX / AUDIT_OUT not set'); await page.goto('/') })

test('repro: batch "images → one PDF" with GPS JPEGs', async ({ page }, info) => {
  await page.setInputFiles('[data-testid=file-input]', [path.join(FX, 'gps-upright.jpg'), path.join(FX, 'gps-upright2.jpg')])
  const cards = page.getByTestId('file-card')
  for (let i = 0; i < 2; i++) await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
  await page.getByRole('button', { name: /one PDF/i }).click()
  await expect(cards).toHaveCount(3)
  const combined = cards.nth(2)
  await page.getByTestId('convert-all').click()
  await expect(combined).toHaveAttribute('data-status', 'completed', { timeout: 60_000 })
  const out = await download(page, 2)
  writeFileSync(path.join(dir(info.project.name), 'combined.pdf'), out.bytes)
})

for (const [file, conv] of [['gps-upright.jpg', 'image-to-pdf'], ['svg-only.md', 'md-to-pdf'], ['svg-sized.md', 'md-to-pdf'], ['internal-entity.xml', 'data-to-json'], ['doctype-only.xml', 'data-to-json'], ['data-encrypted.7z', 'archive-extract-7z'], ['aes.zip', 'archive-extract']] as const) {
  test(`repro: ${file} -> ${conv}`, async ({ page }, info) => {
    await page.setInputFiles('[data-testid=file-input]', path.join(FX, file))
    const card = page.getByTestId('file-card').first()
    await expect(card).not.toHaveAttribute('data-status', 'detecting')
    await chooseTarget(page, 0, conv)
    await convertAndWait(page, 1)
    const status = await card.getAttribute('data-status')
    const rec: Record<string, unknown> = { file, conv, status, text: (await card.innerText()).slice(0, 600) }
    if (status === 'completed') {
      const out = await download(page, 0)
      writeFileSync(path.join(dir(info.project.name), `${file}.${conv}.out`), out.bytes)
      rec.name = out.name
    }
    writeFileSync(path.join(dir(info.project.name), `${file}.${conv}.json`), JSON.stringify(rec, null, 2))
  })
}

test('repro: in-card Stop is reachable on a short phone viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 560 })
  await page.setInputFiles('[data-testid=file-input]', path.join(FX, 'long.mp4'))
  const card = page.getByTestId('file-card').first()
  await expect(card).not.toHaveAttribute('data-status', 'detecting')
  await chooseTarget(page, 0, 'video-to-webm')
  await page.getByTestId('convert-all').click()
  const stop = card.getByRole('button', { name: /^stop$/i })
  await expect(stop).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(800)
  let clickable = true
  try { await stop.click({ timeout: 5000 }) } catch (e) { clickable = false }
  const status = await card.getAttribute('data-status')
  writeFileSync(path.join(dir(info.project.name), 'stop-reachable.json'), JSON.stringify({ clickable, status }, null, 2))
})
