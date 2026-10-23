import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

interface StaticConfig { revision: number; base_url: string; public_asset_id: string }
interface Binding { capability: string; enabled: boolean; source_key?: string; revision: number }

async function read<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(path)
  expect(response.status(), `GET ${path}: ${await response.text()}`).toBe(200)
  return (await response.json()).data as T
}

async function mutate<T>(request: APIRequestContext, csrf: string, method: string, path: string, data?: unknown): Promise<T> {
  const response = await request.fetch(path, { method, headers: { 'X-CSRF-Token': csrf }, data })
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200)
  return (await response.json()).data as T
}

async function startBlog(): Promise<{ server: Server; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end('<!doctype html><html><title>Local static media consumer</title><body></body></html>')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Blog fixture did not bind a TCP port')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

async function imageResult(page: Page, url: string, cors: boolean) {
  return page.evaluate(async ({ url, cors }) => {
    const image = new Image()
    if (cors) image.crossOrigin = 'anonymous'
    image.src = url
    try {
      await image.decode()
    } catch {
      return { loaded: false, width: 0, height: 0, readable: false, error: '' }
    }
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    try {
      context.getImageData(0, 0, 1, 1)
      return { loaded: true, width: image.naturalWidth, height: image.naturalHeight, readable: true, error: '' }
    } catch (error) {
      return { loaded: true, width: image.naturalWidth, height: image.naturalHeight, readable: false, error: (error as DOMException).name }
    }
  }, { url, cors })
}

async function fetchResult(page: Page, url: string, headers?: Record<string, string>) {
  return page.evaluate(async ({ url, headers }) => {
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'no-store', headers })
      return {
        readable: true, status: response.status, bytes: (await response.arrayBuffer()).byteLength,
        type: response.headers.get('Content-Type'), etag: response.headers.get('ETag'),
        range: response.headers.get('Content-Range'), acceptRanges: response.headers.get('Accept-Ranges'),
      }
    } catch {
      return { readable: false, status: 0, bytes: 0, type: null, etag: null, range: null, acceptRanges: null }
    }
  }, { url, headers })
}

test('a second origin decodes static media, enforces CORS, seeks video and rejects active content', async ({ page: admin, browser, baseURL }) => {
  test.setTimeout(120_000)
  expect(baseURL).toBeTruthy()
  const login = await admin.request.post('/api/v1/auth/login', {
    data: { username: 'admin', password: 'OmniStore-Test-Admin!' },
  })
  expect(login.status()).toBe(200)
  const csrf: string = (await login.json()).data.csrf_token
  const sources = await read<{ items: Array<{ key: string; name: string }> }>(admin.request, '/api/v1/admin/sources')
  const source = sources.items.find((item) => item.name === '团队文件')!
  expect(source).toBeDefined()
  const configPath = `/api/v1/admin/sources/${source.key}/static-access/config`
  const initial = await read<StaticConfig>(admin.request, configPath)
  expect(initial.public_asset_id, 'The isolated seed must not have a static publication').toBe('')
  const bindingPath = '/api/v1/admin/capabilities/public_drive'
  const bindings = await read<{ items: Binding[] }>(admin.request, '/api/v1/admin/capabilities')
  const publicDrive = bindings.items.find((binding) => binding.capability === 'public_drive')!
  const folder = `browser-media-${Date.now()}`
  const blog = await startBlog()
  expect(blog.origin).not.toBe(new URL(baseURL!).origin)
  // No admin cookies are carried into the second-origin consumer.
  const consumer = await browser.newContext()
  const page = await consumer.newPage()
  page.setDefaultTimeout(15_000)
  let configured = false
  let folderCreated = false
  let config: StaticConfig
  let serial = 0
  const assetURL = (path: string) => `${config.base_url}${path.split('/').map(encodeURIComponent).join('/')}?probe=${++serial}`
  const update = async (data: unknown) => {
    config = await mutate<StaticConfig>(admin.request, csrf, 'PUT', configPath, { ...data as object, expected_revision: config.revision })
  }
  try {
    await page.goto(blog.origin)
    // Browser-native encoders create real local PNG/JPEG/WebP images, not signature stubs.
    const images = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 6
      const context = canvas.getContext('2d')!
      context.fillStyle = '#e04a32'
      context.fillRect(0, 0, 8, 6)
      return ['image/png', 'image/jpeg', 'image/webp'].map((type) => ({ type, data: canvas.toDataURL(type).split(',')[1] }))
    })
    const files = images.map((image, index) => ({
      name: ['图片 空格%#.png', 'photo.jpg', 'photo.webp'][index], mimeType: image.type, buffer: Buffer.from(image.data, 'base64'),
    }))
    files.push({ name: 'pixel.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') })
    const video = readFileSync(new URL('./fixtures/static-seek.webm', import.meta.url))
    const invalidFiles = [
      { name: 'mismatch.jpg', mimeType: 'image/jpeg', buffer: files[0].buffer },
      { name: 'pretend.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>window.publishedScriptExecuted=true</script></html>') },
      { name: 'active.html', mimeType: 'text/html', buffer: Buffer.from('<html><script>window.publishedScriptExecuted=true</script></html>') },
      { name: 'active.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.publishedScriptExecuted=true"/>') },
      { name: 'active.js', mimeType: 'text/javascript', buffer: Buffer.from('window.publishedScriptExecuted=true') },
    ]
    await mutate(admin.request, csrf, 'POST', `/api/v1/sources/${source.key}/folders`, { path: '', name: folder })
    folderCreated = true
    for (const file of [...files, { name: 'seek.webm', mimeType: 'video/webm', buffer: video }, ...invalidFiles]) {
      const response = await admin.request.post(`/api/v1/sources/${source.key}/upload?path=${encodeURIComponent(folder)}`, {
        headers: { 'X-CSRF-Token': csrf }, multipart: { file },
      })
      expect(response.status(), `ordinary upload ${file.name}: ${await response.text()}`).toBe(200)
    }
    await mutate(admin.request, csrf, 'PUT', bindingPath, { enabled: false, expected_revision: publicDrive.revision })
    config = await mutate<StaticConfig>(admin.request, csrf, 'POST', configPath, { publish_root: folder, cache_mode: 'no-cache', cors_mode: 'public' })
    configured = true

    await test.step('public CORS decodes four real image formats and allows credentialless Canvas/fetch', async () => {
      for (const file of files) {
        const url = assetURL(file.name)
        const responsePromise = page.waitForResponse(url)
        const result = await imageResult(page, url, true)
        expect(result).toMatchObject({ loaded: true, readable: true })
        expect(result.width).toBeGreaterThan(0)
        expect(result.height).toBeGreaterThan(0)
        const response = await responsePromise
        const headers = await response.allHeaders()
        expect(response.status()).toBe(200)
        expect(headers['content-type']).toBe(file.mimeType)
        expect(headers['access-control-allow-origin']).toBe('*')
        expect(headers['access-control-allow-credentials']).toBeUndefined()
        expect(headers['set-cookie']).toBeUndefined()
        expect(headers['cross-origin-resource-policy']).toBe('cross-origin')
        expect(headers['x-content-type-options']).toBe('nosniff')
        expect((await response.request().allHeaders()).cookie).toBeUndefined()
      }
      const result = await fetchResult(page, assetURL(files[0].name))
      expect(result).toMatchObject({ readable: true, status: 200, bytes: files[0].buffer.length, type: 'image/png' })
      expect(result.etag).toBeTruthy()
      expect(result.acceptRanges).toBe('bytes')
      expect((await admin.request.get('/public/raw/README.txt')).status()).toBe(404)
    })

    await test.step('allowlist and none preserve embedding but constrain Canvas and script reads', async () => {
      await update({ cors_mode: 'allowlist', allowed_origins: [blog.origin] })
      const allowedURL = assetURL(files[0].name)
      const allowedResponse = page.waitForResponse(allowedURL)
      expect(await imageResult(page, allowedURL, true)).toMatchObject({ loaded: true, readable: true })
      const headers = await (await allowedResponse).allHeaders()
      expect(headers['access-control-allow-origin']).toBe(blog.origin)
      expect(headers.vary.split(/,\s*/)).toContain('Origin')
      expect((await fetchResult(page, assetURL(files[0].name))).readable).toBe(true)
      for (const cors_mode of ['allowlist', 'none']) {
        await update({ cors_mode, allowed_origins: ['https://not-this-blog.example'] })
        expect(await imageResult(page, assetURL(files[0].name), false)).toMatchObject({ loaded: true, readable: false, error: 'SecurityError' })
        expect((await imageResult(page, assetURL(files[0].name), true)).loaded).toBe(false)
        expect((await fetchResult(page, assetURL(files[0].name))).readable).toBe(false)
      }
      await update({ cors_mode: 'public', allowed_origins: [] })
      // Static CORS cannot open the authenticated administrative API or its preflight.
      expect((await fetchResult(page, new URL('/api/v1/admin/sources', baseURL).href)).readable).toBe(false)
      expect((await fetchResult(page, new URL('/api/v1/admin/sources', baseURL).href, { 'X-CSRF-Token': 'untrusted-blog' })).readable).toBe(false)
      const adminResponse = await admin.request.get('/api/v1/admin/sources', { headers: { Origin: blog.origin } })
      expect(adminResponse.status()).toBe(200)
      expect(adminResponse.headers()['access-control-allow-origin']).toBeUndefined()
    })

    await test.step('cross-origin WebM playback seeks through actual nonzero byte Range requests', async () => {
      const session = await consumer.newCDPSession(page)
      await session.send('Network.enable')
      await session.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 24 * 1024, uploadThroughput: -1 })
      const url = assetURL('seek.webm')
      const responses: import('@playwright/test').Response[] = []
      page.on('response', (response) => { if (response.url() === url) responses.push(response) })
      try {
        const result = await page.evaluate(async (url) => {
          const video = document.createElement('video')
          video.crossOrigin = 'anonymous'
          video.muted = true
          video.preload = 'metadata'
          document.body.append(video)
          const event = (name: string) => new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timed out waiting for video ${name}`)), 20_000)
            video.addEventListener(name, () => { clearTimeout(timer); resolve() }, { once: true })
            video.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`Video error ${video.error?.code}`)) }, { once: true })
          })
          const metadata = event('loadedmetadata')
          video.src = url
          await metadata
          const seeked = event('seeked')
          video.currentTime = video.duration - 1
          await seeked
          await video.play()
          const played = event('timeupdate')
          await played
          video.pause()
          return { duration: video.duration, currentTime: video.currentTime, width: video.videoWidth, height: video.videoHeight }
        }, url)
        expect(result).toMatchObject({ width: 160, height: 90 })
        expect(result.duration).toBeGreaterThan(10)
        expect(result.currentTime).toBeGreaterThan(10)
        const requests = await Promise.all(responses.map(async (response) => ({ response, headers: await response.request().allHeaders() })))
        const seek = requests.find(({ headers }) => /^bytes=[1-9]\d*-/.test(headers.range ?? ''))
        expect(seek, 'Seeking must cause a real nonzero Range request to OmniStore').toBeDefined()
        expect(seek!.response.status()).toBe(206)
        const headers = await seek!.response.allHeaders()
        expect(headers['content-type']).toBe('video/webm')
        expect(headers['content-range']).toMatch(/^bytes [1-9]\d*-\d+\/\d+$/)
        expect(headers['access-control-allow-origin']).toBe('*')
        expect(headers['set-cookie']).toBeUndefined()
      } finally {
        await session.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
        await page.evaluate(() => { for (const video of document.querySelectorAll('video')) { video.removeAttribute('src'); video.load(); video.remove() } })
        await session.detach()
      }
      const ranged = await fetchResult(page, assetURL('seek.webm'), { Range: 'bytes=7-31' })
      expect(ranged).toMatchObject({ readable: true, status: 206, bytes: 25, range: `bytes 7-31/${video.length}` })
    })

    await test.step('type mismatches, active content, internal paths and disabled publications fail with real 404', async () => {
      for (const path of [...invalidFiles.map((file) => file.name), '.omnistore/private.png', 'missing.png', '']) {
        const url = assetURL(path)
        expect((await imageResult(page, url, false)).loaded).toBe(false)
        // Chromium's ORB can hide error responses from page response events.
        // Check the browser rejection and the real anonymous HTTP status separately.
        const response = await consumer.request.get(url)
        expect(response.status(), path).toBe(404)
        expect(response.headers()['cache-control']).toBe('no-store')
      }
      const scriptExecuted = await page.evaluate(async (url) => {
        const script = document.createElement('script')
        const settled = new Promise<void>((resolve) => { script.onload = () => resolve(); script.onerror = () => resolve() })
        script.src = url
        document.body.append(script)
        await settled
        return 'publishedScriptExecuted' in window
      }, assetURL('active.js'))
      expect(scriptExecuted).toBe(false)
      await update({ enabled: false })
      const disabledURL = assetURL(files[0].name)
      expect((await imageResult(page, disabledURL, false)).loaded).toBe(false)
      const disabledResponse = await consumer.request.get(disabledURL)
      expect(disabledResponse.status()).toBe(404)
      expect(disabledResponse.headers()['cache-control']).toBe('no-store')
      await update({ enabled: true })
      expect(await imageResult(page, assetURL(files[0].name), true)).toMatchObject({ loaded: true, readable: true })
    })
  } finally {
    await consumer.close()
    await new Promise<void>((resolve, reject) => blog.server.close((error) => error ? reject(error) : resolve()))
    if (configured) {
      const disabled = await mutate<StaticConfig>(admin.request, csrf, 'PUT', configPath, { enabled: false })
      await mutate(admin.request, csrf, 'DELETE', configPath, { expected_revision: disabled.revision })
    }
    if (folderCreated) await mutate(admin.request, csrf, 'DELETE', `/api/v1/sources/${source.key}/files?path=${encodeURIComponent(folder)}`)
    const current = (await read<{ items: Binding[] }>(admin.request, '/api/v1/admin/capabilities')).items.find((binding) => binding.capability === 'public_drive')!
    await mutate(admin.request, csrf, 'PUT', bindingPath, {
      enabled: publicDrive.enabled, storage_source_key: publicDrive.source_key ?? '', expected_revision: current.revision,
    })
  }
})
