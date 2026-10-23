// Deterministic, synthetic media only. Regenerate with:
// node web/e2e/fixtures/generate-static-video.mjs /path/to/ffmpeg
// The minimal ffmpeg bundled with Playwright also supports these options.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
let images
try {
  const page = await browser.newPage()
  images = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    const image = context.createImageData(160, 90)
    const frames = []
    let random = 0x12345678
    for (let frame = 0; frame < 120; frame++) {
      for (let offset = 0; offset < image.data.length; offset += 4) {
        random ^= random << 13
        random ^= random >>> 17
        random ^= random << 5
        image.data[offset] = (random >>> 16) & 255
        image.data[offset + 1] = (random >>> 8) & 255
        image.data[offset + 2] = random & 255
        image.data[offset + 3] = 255
      }
      context.putImageData(image, 0, 0)
      frames.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
    }
    return frames
  })
} finally {
  await browser.close()
}
const result = spawnSync(process.argv[2] ?? 'ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '10',
  '-i', 'pipe:0', '-an', '-c:v', 'libvpx', '-b:v', '400k', '-g', '10',
  '-pix_fmt', 'yuv420p', '-metadata', 'title=OmniStore synthetic seek fixture',
  fileURLToPath(new URL('./static-seek.webm', import.meta.url)),
], { input: Buffer.concat(images.map((image) => Buffer.from(image, 'base64'))), maxBuffer: 16 * 1024 * 1024 })
if (result.error) throw new Error(`${result.error.message}\n${result.stderr?.toString() ?? ''}`)
if (result.status !== 0) throw new Error(result.stderr.toString())
