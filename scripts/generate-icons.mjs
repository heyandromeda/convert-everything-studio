// Renders the PWA / home-screen icons from inline SVG using Playwright's Chromium.
import { chromium } from '@playwright/test'

const art = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#111318"/>
<rect x="${pad}" y="${pad}" width="${512 - pad * 2}" height="${512 - pad * 2}" rx="${(512 - pad * 2) * 0.28}" fill="#5fd9b4"/>
<g transform="translate(256 256) scale(${(512 - pad * 2) / 32}) translate(-16 -16)">
<path d="M10 12.5h9.5l-2.6-2.6M22 19.5h-9.5l2.6 2.6" fill="none" stroke="#0f2a22" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`

const targets = [
  ['public/icons/icon-192.png', 192, 40],
  ['public/icons/icon-512.png', 512, 40],
  ['public/icons/icon-maskable-512.png', 512, 96],
  ['public/icons/apple-touch-icon.png', 180, 0],
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size })
  const svg = pad === 0 ? art(0).replace(/rx="[^"]*"/, 'rx="0"') : art(pad)
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: file, omitBackground: false })
}
await browser.close()
console.log('icons written')
