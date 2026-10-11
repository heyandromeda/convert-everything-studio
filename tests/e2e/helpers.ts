import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'

/**
 * Every test fails if the app contacts any origin other than the one serving it, or sends
 * anything with a request body (which is how file contents would leave the device).
 */
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ page, baseURL }, use) => {
      const seen: string[] = []
      const uploads: string[] = []
      const allowed = new Set([new URL(baseURL ?? 'http://localhost').origin])
      if (process.env.LIVE_URL) allowed.add(new URL(process.env.LIVE_URL).origin)
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (!u.protocol.startsWith('http')) return
        if (!allowed.has(u.origin)) seen.push(r.url())
        if (!['GET', 'HEAD'].includes(r.method()) || r.postDataBuffer()?.length) uploads.push(`${r.method()} ${r.url()}`)
      })
      await use(seen)
      expect(seen, 'requests to other origins').toEqual([])
      expect(uploads, 'requests that carry a body').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export const fixture = (name: string) => path.join(import.meta.dirname, '..', 'fixtures', name)

export async function addFiles(page: Page, names: string[]) {
  await page.setInputFiles('[data-testid=file-input]', names.map(fixture))
  await expect(page.locator('[data-testid=file-card]')).toHaveCount(names.length)
  for (let i = 0; i < names.length; i++) {
    await expect(page.locator('[data-testid=file-card]').nth(i)).not.toHaveAttribute('data-status', 'detecting')
  }
}

export async function chooseTarget(page: Page, cardIndex: number, conversionId: string) {
  const card = page.locator('[data-testid=file-card]').nth(cardIndex)
  await card.getByTestId('format-picker').click()
  await page.getByTestId(`target-${conversionId}`).click()
  await expect(page.getByTestId(`target-${conversionId}`)).toBeHidden()
}

export async function convertAndWait(page: Page, count = 1) {
  await page.getByTestId('convert-all').click()
  for (let i = 0; i < count; i++) {
    await expect(page.locator('[data-testid=file-card]').nth(i)).toHaveAttribute('data-status', /completed|failed/, { timeout: 110_000 })
  }
}

let lastDownload = 0

/** Clicks a download link, saves the file and returns its bytes, suggested name and Blob MIME type. */
export async function download(page: Page, cardIndex: number, resultIndex = 0) {
  // Chromium silently drops the 11th download a page starts within about a second; no person taps that fast.
  const wait = lastDownload + 150 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  lastDownload = Date.now()
  const card = page.locator('[data-testid=file-card]').nth(cardIndex)
  const link = card.getByTestId('download-link').nth(resultIndex)
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()])
  const p = await dl.path()
  const mime = await link.evaluate(async (a: HTMLAnchorElement) => (await (await fetch(a.href)).blob()).type)
  return { name: dl.suggestedFilename(), bytes: readFileSync(p!), path: p!, mime }
}

/** Text of the error notice on a failed card. */
export async function errorText(page: Page, cardIndex: number) {
  const card = page.locator('[data-testid=file-card]').nth(cardIndex)
  await expect(card).toHaveAttribute('data-status', 'failed')
  return (await card.getByRole('alert').innerText()).trim()
}

/** Runs the system exiftool and returns every tag it can read. */
export function exif(file: string): Record<string, unknown> {
  return JSON.parse(execFileSync('exiftool', ['-j', '-a', '-G1', file], { encoding: 'utf8' }))[0]
}

/** Uses the system ffprobe as an independent decoder to validate outputs. */
export function probe(file: string): { codec_name: string; width?: number; height?: number; duration?: string; channels?: number; sample_rate?: string }[] {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8' })
  return JSON.parse(out).streams
}

export const ascii = (b: Buffer, start: number, len: number) => b.subarray(start, start + len).toString('latin1')
