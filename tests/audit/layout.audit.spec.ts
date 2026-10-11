import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, chooseTarget } from '../e2e/helpers'

/** Audit: horizontal overflow and key control geometry at phone and desktop widths. Screenshots go to AUDIT_OUT. */
const FX = process.env.AUDIT_FX ?? ''
const OUT = process.env.AUDIT_OUT ?? ''

for (const [w, h] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1280, 800]]) {
  test(`layout ${w}x${h}`, async ({ page }, info) => {
    test.skip(!FX || !OUT, 'AUDIT_FX / AUDIT_OUT not set')
    const dir = path.join(OUT, info.project.name, 'layout'); mkdirSync(dir, { recursive: true })
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    const rec: Record<string, unknown> = { home: await overflow() }
    await page.screenshot({ path: path.join(dir, `${w}-home.png`) })
    await page.setInputFiles('[data-testid=file-input]', [path.join(FX, 'quad.png'), path.join(FX, 'SECRETNAME-Ωmega-confidential.png'), path.join(FX, 'three.pdf')])
    const cards = page.getByTestId('file-card')
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).not.toHaveAttribute('data-status', 'detecting')
    rec.withFiles = await overflow()
    await cards.first().getByTestId('format-picker').click()
    rec.pickerOpen = await overflow()
    await page.screenshot({ path: path.join(dir, `${w}-picker.png`) })
    await page.keyboard.press('Escape')
    await cards.first().getByRole('button', { name: 'Conversion settings' }).click()
    rec.optionsOpen = await overflow()
    await page.getByRole('button', { name: 'Settings and privacy' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(500)
    rec.settingsBox = await dialog.boundingBox()
    rec.settingsHeadingBox = await dialog.getByRole('heading').first().boundingBox()
    rec.settingsOpen = await overflow()
    await page.screenshot({ path: path.join(dir, `${w}-settings.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await chooseTarget(page, 2, 'pdf-to-png')
    await page.getByTestId('convert-all').click()
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveAttribute('data-status', 'completed', { timeout: 60_000 })
    rec.withResults = await overflow()
    // Smallest touch target among visible buttons in the cards.
    rec.minButton = await page.locator('[data-testid=file-card] button:visible').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).reduce((m, r) => Math.min(m, r.width, r.height), 999))
    await page.screenshot({ path: path.join(dir, `${w}-results.png`), fullPage: true })
    writeFileSync(path.join(dir, `${w}.json`), JSON.stringify(rec, null, 2))
  })
}
