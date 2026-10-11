// Audit probe: opens a converted HTML file from disk (no CSP, as a user would) and lists every network request it attempts.
// Usage (from the repo root): node tests/audit/tools/open-html.mjs /abs/path/to/output.html
import { chromium } from '@playwright/test'

const file = process.argv[2]
const browser = await chromium.launch(process.env.AUDIT_CHROMIUM ? { executablePath: process.env.AUDIT_CHROMIUM } : {})
const context = await browser.newContext()
const hits = []
await context.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith('file:')) return route.continue()
  hits.push(`${route.request().resourceType()} ${url}`)
  return route.abort()
})
const page = await context.newPage()
await page.goto('file://' + file)
await page.waitForTimeout(2000)
console.log(JSON.stringify(hits, null, 1))
await browser.close()
