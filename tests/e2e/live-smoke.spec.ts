import { expect, test, addFiles, ascii, chooseTarget, convertAndWait, download, probe } from './helpers'

/**
 * Smoke test against a deployed preview. Skipped unless LIVE_URL is set, e.g.
 *   LIVE_URL=https://example.netlify.app LIVE_PASSWORD=... npx playwright test live-smoke --project=webkit-iphone
 */
const LIVE_URL = process.env.LIVE_URL

test.skip(!LIVE_URL, 'LIVE_URL not set')

test('live preview: PNG → WebP end to end', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol.startsWith('http') && u.origin !== new URL(LIVE_URL!).origin) external.push(r.url())
  })
  await page.goto(LIVE_URL!)
  if (process.env.LIVE_PASSWORD && (await page.locator('input[type=password]').count())) {
    await page.fill('input[type=password]', process.env.LIVE_PASSWORD)
    await page.keyboard.press('Enter')
    await page.waitForLoadState('networkidle')
  }
  await expect(page.getByRole('heading', { name: 'Convert Everything' })).toBeVisible()
  await addFiles(page, ['alpha.png'])
  await expect(page.getByTestId('detected-format')).toHaveText('PNG')
  await chooseTarget(page, 0, 'image-to-webp')
  await convertAndWait(page)
  const out = await download(page, 0)
  expect(ascii(out.bytes, 8, 4)).toBe('WEBP')
  expect(probe(out.path)[0].codec_name).toBe('webp')
  expect(external).toEqual([])
})
