import { expect, test } from '@playwright/test'
import { addFiles, ascii, chooseTarget, convertAndWait, download } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('unrecognised binary files are not offered fake conversions', async ({ page }) => {
  await addFiles(page, ['random.bin'])
  const card = page.getByTestId('file-card').first()
  await expect(card).toHaveAttribute('data-status', 'unsupported')
  await expect(card).toContainText('not recognised')
  await expect(card.getByTestId('format-picker')).toHaveCount(0)
})

test('a damaged image fails with a clear message and the app keeps working', async ({ page }) => {
  await addFiles(page, ['truncated.jpg', 'alpha.png'])
  await chooseTarget(page, 0, 'image-to-png')
  await chooseTarget(page, 1, 'image-to-webp')
  await convertAndWait(page, 2)
  const bad = page.getByTestId('file-card').first()
  // Some browsers decode partial JPEGs; either a valid PNG or a readable error is acceptable, never a fake file.
  const status = await bad.getAttribute('data-status')
  if (status === 'failed') {
    await expect(bad).toContainText(/could not be decoded|damaged/)
    await expect(bad.getByRole('button', { name: 'Retry' })).toBeVisible()
  } else {
    const out = await download(page, 0)
    expect(ascii(out.bytes, 1, 3)).toBe('PNG')
  }
  await expect(page.getByTestId('file-card').nth(1)).toHaveAttribute('data-status', 'completed')
})

test('a running conversion can be stopped and retried', async ({ page }) => {
  await addFiles(page, ['large.png'])
  await chooseTarget(page, 0, 'image-to-avif')
  await page.getByTestId('convert-all').click()
  const card = page.getByTestId('file-card').first()
  await expect(card).toHaveAttribute('data-status', /preparing|loading-engine|processing/)
  await card.getByRole('button', { name: 'Stop' }).click()
  await expect(card).toHaveAttribute('data-status', 'canceled')
  await expect(card).toContainText('Nothing was saved')
  await chooseTarget(page, 0, 'image-to-webp')
  await card.getByRole('button', { name: 'Convert just this file' }).or(page.getByTestId('convert-all')).first().click()
  await expect(card).toHaveAttribute('data-status', 'completed', { timeout: 60_000 })
})

test('works offline after the first visit (service worker)', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit on Linux does not support service-worker offline emulation')
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, { timeout: 15_000 }).catch(() => {})
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Convert Everything' })).toBeVisible()
  await expect(page.getByText('Offline')).toBeVisible()
  await addFiles(page, ['alpha.png'])
  await chooseTarget(page, 0, 'image-to-webp')
  await convertAndWait(page)
  const out = await download(page, 0)
  expect(ascii(out.bytes, 8, 4)).toBe('WEBP')
  await context.setOffline(false)
})

test('SVG with scripts is sanitised before rasterising', async ({ page }) => {
  let alerted = false
  page.on('dialog', async (d) => {
    alerted = true
    await d.dismiss()
  })
  await addFiles(page, ['logo.svg'])
  await chooseTarget(page, 0, 'image-to-png')
  await convertAndWait(page)
  const out = await download(page, 0)
  expect(ascii(out.bytes, 1, 3)).toBe('PNG')
  expect(alerted).toBe(false)
})
