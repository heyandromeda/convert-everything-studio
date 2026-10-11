import { readFileSync } from 'node:fs'
import { test, expect, fixture, chooseTarget, convertAndWait } from '../e2e/helpers'

// Audit probe: record the download attribute and the browser's suggested filename for each unusual name.
test('audit: download names for unusual inputs', async ({ page }) => {
  await page.goto('/')
  const png = readFileSync(fixture('alpha.png'))
  const names = ['📷 Fotoğraf — ünïcødé 日本語.png', '<img src=x onerror=alert(1)>.png', `${'very-long-name-'.repeat(17)}end.png`, 'CON.png', 'a:b|c?d*e"f.png', '.hidden.png', '..png', 'résumé.PNG']
  await page.setInputFiles('[data-testid=file-input]', names.map((name) => ({ name, mimeType: 'image/png', buffer: png })))
  const cards = page.getByTestId('file-card')
  await expect(cards).toHaveCount(names.length)
  for (let i = 0; i < names.length; i++) {
    await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
    await chooseTarget(page, i, 'image-to-webp')
  }
  await convertAndWait(page, names.length)
  const rows: string[] = []
  for (let i = 0; i < names.length; i++) {
    await page.waitForTimeout(200)
    const link = cards.nth(i).getByTestId('download-link')
    const attr = await link.getAttribute('download')
    const [dl] = await Promise.all([page.waitForEvent('download'), link.click()])
    rows.push(JSON.stringify({ input: names[i], attr, attrLen: attr?.length, suggested: dl.suggestedFilename() }))
  }
  console.log('AUDIT-NAMES\n' + rows.join('\n'))
})
