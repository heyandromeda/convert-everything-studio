import { expect, test, addFiles, chooseTarget, convertAndWait, download, probe } from './helpers'

// FFmpeg.wasm is ~32 MB and runs single-threaded, so these tests get a longer timeout.
test.describe.configure({ timeout: 240_000 })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('WAV → MP3 and video → audio extraction (M4A)', async ({ page }) => {
  await addFiles(page, ['tone.wav', 'clip.mp4'])
  await chooseTarget(page, 0, 'audio-to-mp3')
  await chooseTarget(page, 1, 'audio-to-m4a')
  await convertAndWait(page, 2)
  await expect(page.getByTestId('file-card').first()).toHaveAttribute('data-status', 'completed')
  const mp3 = await download(page, 0)
  const [a] = probe(mp3.path)
  expect(a.codec_name).toBe('mp3')
  expect(a.channels).toBe(2)
  expect(Math.abs(Number(a.duration) - 2)).toBeLessThan(0.15)
  const m4a = await download(page, 1)
  expect(m4a.name).toBe('clip-audio.m4a')
  const streams = probe(m4a.path)
  expect(streams.map((s) => s.codec_name)).toEqual(['aac'])
})

test('video → GIF and MOV → MP4 (H.264)', async ({ page }) => {
  await addFiles(page, ['clip.mp4', 'clip.mov'])
  await chooseTarget(page, 0, 'video-to-gif')
  await chooseTarget(page, 1, 'video-to-mp4')
  await convertAndWait(page, 2)
  const gif = await download(page, 0)
  const [g] = probe(gif.path)
  expect(g.codec_name).toBe('gif')
  expect(g.width).toBe(320)
  const mp4 = await download(page, 1)
  const [v] = probe(mp4.path)
  expect(v.codec_name).toBe('h264')
  expect([v.width, v.height]).toEqual([320, 240])
})

test('audio trim produces the requested duration', async ({ page }) => {
  await addFiles(page, ['tone.wav'])
  await chooseTarget(page, 0, 'audio-to-flac')
  await page.getByLabel('Conversion settings').click()
  await page.getByLabel('Start at').fill('0.5')
  await page.getByLabel('End at').fill('1.5')
  await convertAndWait(page)
  const flac = await download(page, 0)
  const [a] = probe(flac.path)
  expect(a.codec_name).toBe('flac')
  expect(Math.abs(Number(a.duration) - 1)).toBeLessThan(0.05)
})
