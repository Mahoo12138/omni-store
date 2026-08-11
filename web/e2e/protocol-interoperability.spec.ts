import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

interface ProtocolCredentials {
  http_endpoint: string
  s3_endpoint: string
  username: string
  webdav_token: string
  access_key_id: string
  secret_access_key: string
  region: string
  team_bucket: string
}

const adminPassword = 'OmniStore-Test-Admin!'

function loadProtocolCredentials(): ProtocolCredentials | null {
  const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.testdata/protocol-credentials.json')
  const path = process.env.OMNISTORE_E2E_PROTOCOL_CREDENTIALS ?? defaultPath
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as ProtocolCredentials
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function amzTimestamp(now = new Date()): { date: string; timestamp: string } {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { date: timestamp.slice(0, 8), timestamp }
}

async function signedS3Request(
  request: APIRequestContext,
  credentials: ProtocolCredentials,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  body = Buffer.alloc(0),
) {
  const url = new URL(`${credentials.s3_endpoint}/${credentials.team_bucket}/${key}`)
  const payloadHash = sha256(body)
  const { date, timestamp } = amzTimestamp()
  const signedHeaders = 'host;x-amz-date'
  const canonicalHeaders = `host:${url.host}\nx-amz-date:${timestamp}\n`
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${date}/${credentials.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join('\n')
  const dateKey = hmac(`AWS4${credentials.secret_access_key}`, date)
  const regionKey = hmac(dateKey, credentials.region)
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')

  return request.fetch(url.toString(), {
    method,
    data: method === 'PUT' ? body : undefined,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.access_key_id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': timestamp,
    },
  })
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

test('WebDAV and S3 share files, permissions and storage quota', async ({ page, request, playwright }) => {
  const credentials = loadProtocolCredentials()
  test.skip(!credentials, '需要默认测试环境或 OMNISTORE_E2E_PROTOCOL_CREDENTIALS')
  if (!credentials) return

  const suffix = `${Date.now()}`
  const davFile = `e2e-webdav-${suffix}.txt`
  const s3File = `e2e-s3-${suffix}.txt`
  const quotaDAVFile = `e2e-quota-dav-${suffix}.txt`
  const quotaS3File = `e2e-quota-s3-${suffix}.txt`
  const basicAuth = `Basic ${Buffer.from(`${credentials.username}:${credentials.webdav_token}`).toString('base64')}`
  const davURL = (name: string) => `${credentials.http_endpoint}/dav/${credentials.team_bucket}/${name}`
  const admin = await playwright.request.newContext({ baseURL: credentials.http_endpoint })
  let csrfToken = ''
  let originalQuota = 0
  let quotaChanged = false

  try {
    const options = await request.fetch(`${credentials.http_endpoint}/dav/${credentials.team_bucket}`, {
      method: 'OPTIONS', headers: { Authorization: basicAuth },
    })
    expect(options.status()).toBe(200)
    expect(options.headers().dav).toBe('1, 2')

    const davPut = await request.put(davURL(davFile), {
      data: Buffer.from('written through WebDAV\n'), headers: { Authorization: basicAuth },
    })
    expect(davPut.status()).toBe(201)
    const s3ReadDAV = await signedS3Request(request, credentials, 'GET', davFile)
    expect(s3ReadDAV.status()).toBe(200)
    expect(await s3ReadDAV.text()).toBe('written through WebDAV\n')

    const s3Put = await signedS3Request(request, credentials, 'PUT', s3File, Buffer.from('written through S3\n'))
    expect(s3Put.status()).toBe(200)
    expect(s3Put.headers().etag).toMatch(/^"[0-9a-f]{32}"$/)
    const davReadS3 = await request.get(davURL(s3File), { headers: { Authorization: basicAuth } })
    expect(davReadS3.status()).toBe(200)
    expect(await davReadS3.text()).toBe('written through S3\n')

    await login(page, credentials.username, 'OmniStore-Test-Demo!')
    await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
    await expect(page.getByRole('row', { name: new RegExp(davFile) })).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(s3File) })).toBeVisible()

    const s3DeleteDAV = await signedS3Request(request, credentials, 'DELETE', davFile)
    expect(s3DeleteDAV.status()).toBe(204)
    const davDeleteS3 = await request.delete(davURL(s3File), { headers: { Authorization: basicAuth } })
    expect(davDeleteS3.status()).toBe(204)

    const loginResponse = await admin.post('/api/v1/auth/login', {
      data: { username: 'admin', password: adminPassword },
    })
    expect(loginResponse.status()).toBe(200)
    const loginBody = await loginResponse.json() as { data: { csrf_token: string } }
    csrfToken = loginBody.data.csrf_token
    const sourceResponse = await admin.get(`/api/v1/admin/sources/${credentials.team_bucket}`)
    expect(sourceResponse.status()).toBe(200)
    const sourceBody = await sourceResponse.json() as {
      data: { source: { quota_bytes: number }; quota: { usage_bytes: number } }
    }
    originalQuota = sourceBody.data.source.quota_bytes
    const setQuota = await admin.patch(`/api/v1/admin/sources/${credentials.team_bucket}`, {
      data: { quota_bytes: sourceBody.data.quota.usage_bytes },
      headers: { 'X-CSRF-Token': csrfToken },
    })
    expect(setQuota.status()).toBe(200)
    quotaChanged = true

    const davQuota = await request.put(davURL(quotaDAVFile), {
      data: Buffer.from('quota blocked'), headers: { Authorization: basicAuth },
    })
    expect(davQuota.status()).toBe(507)
    const s3Quota = await signedS3Request(request, credentials, 'PUT', quotaS3File, Buffer.from('quota blocked'))
    expect(s3Quota.status()).toBe(507)
    expect(await s3Quota.text()).toContain('<Code>InsufficientStorage</Code>')

    await page.reload()
    await expect(page.getByRole('row', { name: new RegExp(davFile) })).toHaveCount(0)
    await expect(page.getByRole('row', { name: new RegExp(s3File) })).toHaveCount(0)
    await expect(page.getByRole('row', { name: new RegExp(quotaDAVFile) })).toHaveCount(0)
    await expect(page.getByRole('row', { name: new RegExp(quotaS3File) })).toHaveCount(0)
  } finally {
    let restoreFailure = ''
    if (quotaChanged) {
      const restoreQuota = await admin.patch(`/api/v1/admin/sources/${credentials.team_bucket}`, {
        data: { quota_bytes: originalQuota }, headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!restoreQuota.ok()) {
		restoreFailure = `恢复测试来源配额失败: HTTP ${restoreQuota.status()}`
      }
    }
    await signedS3Request(request, credentials, 'DELETE', davFile).catch(() => undefined)
    await signedS3Request(request, credentials, 'DELETE', s3File).catch(() => undefined)
    await request.delete(davURL(quotaDAVFile), { headers: { Authorization: basicAuth } }).catch(() => undefined)
    await request.delete(davURL(quotaS3File), { headers: { Authorization: basicAuth } }).catch(() => undefined)
    await admin.dispose()
    if (restoreFailure) throw new Error(restoreFailure)
  }
})
