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

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

function amzTimestamp(now = new Date()): { date: string; timestamp: string } {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { date: timestamp.slice(0, 8), timestamp }
}

type S3Method = 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE'

function canonicalQueryString(query: Array<[string, string]>): string {
  return query
    .map(([name, value]) => [awsEncode(name), awsEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => (
      leftName < rightName ? -1 : leftName > rightName ? 1
        : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
    ))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
}

async function signedS3PathRequest(
  request: APIRequestContext,
  credentials: ProtocolCredentials,
  method: S3Method,
  resourcePath: string,
  body = Buffer.alloc(0),
  query: Array<[string, string]> = [],
  headers: Record<string, string> = {},
) {
  const url = new URL(resourcePath, credentials.s3_endpoint)
  const canonicalQuery = canonicalQueryString(query)
  url.search = canonicalQuery
  const payloadHash = sha256(body)
  const { date, timestamp } = amzTimestamp()
  const signedHeaders = 'host;x-amz-date'
  const canonicalHeaders = `host:${url.host}\nx-amz-date:${timestamp}\n`
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
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
    data: method === 'PUT' || method === 'POST' ? body : undefined,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.access_key_id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': timestamp,
      ...headers,
    },
  })
}

function signedS3Request(
  request: APIRequestContext,
  credentials: ProtocolCredentials,
  method: S3Method,
  key: string,
  body = Buffer.alloc(0),
  query: Array<[string, string]> = [],
  headers: Record<string, string> = {},
) {
  const encodedKey = key.split('/').map(awsEncode).join('/')
  return signedS3PathRequest(
    request, credentials, method, `/${awsEncode(credentials.team_bucket)}/${encodedKey}`,
    body, query, headers,
  )
}

function presignedS3GetURL(credentials: ProtocolCredentials, key: string): string {
  const encodedKey = key.split('/').map(awsEncode).join('/')
  const url = new URL(`/${awsEncode(credentials.team_bucket)}/${encodedKey}`, credentials.s3_endpoint)
  const { date, timestamp } = amzTimestamp()
  const scope = `${date}/${credentials.region}/s3/aws4_request`
  const query: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${credentials.access_key_id}/${scope}`],
    ['X-Amz-Date', timestamp],
    ['X-Amz-Expires', '300'],
    ['X-Amz-SignedHeaders', 'host'],
    ['x-id', 'GetObject'],
  ]
  const canonicalQuery = canonicalQueryString(query)
  const canonicalRequest = [
    'GET', url.pathname, canonicalQuery, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256', timestamp, scope, sha256(canonicalRequest),
  ].join('\n')
  const dateKey = hmac(`AWS4${credentials.secret_access_key}`, date)
  const regionKey = hmac(dateKey, credentials.region)
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`
  return url.toString()
}

function xmlValue(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}>([^<]+)</${name}>`))
  if (!match) throw new Error(`S3 XML 缺少 ${name}: ${xml}`)
  return match[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
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

test('WebDAV locks block S3 writes and multipart completion until unlock', async ({ page, request }) => {
  const credentials = loadProtocolCredentials()
  test.skip(!credentials, '需要默认测试环境或 OMNISTORE_E2E_PROTOCOL_CREDENTIALS')
  if (!credentials) return

  const suffix = `${Date.now()}`
  const lockedFile = `e2e-locked-${suffix}.txt`
  const abortedFile = `e2e-aborted-${suffix}.txt`
  const basicAuth = `Basic ${Buffer.from(`${credentials.username}:${credentials.webdav_token}`).toString('base64')}`
  const davURL = (name: string) => `${credentials.http_endpoint}/dav/${credentials.team_bucket}/${name}`
  const lockBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner><D:href>OmniStore Playwright</D:href></D:owner>
</D:lockinfo>`
  const multipartBody = Buffer.from('completed through S3 multipart\n')
  let lockToken = ''
  let uploadID = ''
  let abortUploadID = ''

  try {
    const seedFile = await request.put(davURL(lockedFile), {
      data: Buffer.from('before lock\n'), headers: { Authorization: basicAuth },
    })
    expect(seedFile.status()).toBe(201)

    const lock = await request.fetch(davURL(lockedFile), {
      method: 'LOCK',
      data: lockBody,
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'application/xml',
        Depth: '0',
        Timeout: 'Second-120',
      },
    })
    expect(lock.status()).toBe(200)
    lockToken = (lock.headers()['lock-token'] ?? '').replace(/^<|>$/g, '')
    expect(lockToken).toMatch(/^urn:uuid:/)
    expect(await lock.text()).toContain('lockdiscovery')

    const blockedPut = await signedS3Request(
      request, credentials, 'PUT', lockedFile, Buffer.from('blocked S3 overwrite\n'),
    )
    expect(blockedPut.status()).toBe(423)
    expect(await blockedPut.text()).toContain('<Code>OperationAborted</Code>')

    const initiated = await signedS3Request(
      request, credentials, 'POST', lockedFile, Buffer.alloc(0), [['uploads', '']],
    )
    expect(initiated.status()).toBe(200)
    uploadID = xmlValue(await initiated.text(), 'UploadId')
    expect(uploadID).toMatch(/^mpu_[0-9a-f]{48}$/)

    const uploadedPart = await signedS3Request(
      request, credentials, 'PUT', lockedFile, multipartBody,
      [['partNumber', '1'], ['uploadId', uploadID]],
    )
    expect(uploadedPart.status()).toBe(200)
    const partETag = uploadedPart.headers().etag
    expect(partETag).toMatch(/^"[0-9a-f]{32}"$/)

    const listedBeforeComplete = await signedS3Request(
      request, credentials, 'GET', lockedFile, Buffer.alloc(0), [['uploadId', uploadID]],
    )
    expect(listedBeforeComplete.status()).toBe(200)
    expect(xmlValue(await listedBeforeComplete.text(), 'ETag')).toBe(partETag)

    const completeBody = Buffer.from(`<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>${partETag}</ETag></Part></CompleteMultipartUpload>`)
    const blockedComplete = await signedS3Request(
      request, credentials, 'POST', lockedFile, completeBody, [['uploadId', uploadID]],
      { 'Content-Type': 'application/xml' },
    )
    expect(blockedComplete.status()).toBe(423)
    expect(await blockedComplete.text()).toContain('<Code>OperationAborted</Code>')

    const stillRetryable = await signedS3Request(
      request, credentials, 'GET', lockedFile, Buffer.alloc(0), [['uploadId', uploadID]],
    )
    expect(stillRetryable.status()).toBe(200)
    expect(await stillRetryable.text()).toContain('<PartNumber>1</PartNumber>')

    const refresh = await request.fetch(davURL(lockedFile), {
      method: 'LOCK',
      headers: {
        Authorization: basicAuth,
        If: `(<${lockToken}>)`,
        Timeout: 'Second-240',
      },
    })
    expect(refresh.status()).toBe(200)
    expect(refresh.headers()['lock-token']).toBeUndefined()

    const discovered = await request.fetch(davURL(lockedFile), {
      method: 'PROPFIND', headers: { Authorization: basicAuth, Depth: '0' },
    })
    expect(discovered.status()).toBe(207)
    expect(await discovered.text()).toContain(lockToken)

    const davWithToken = await request.put(davURL(lockedFile), {
      data: Buffer.from('written with lock token\n'),
      headers: { Authorization: basicAuth, If: `(<${lockToken}>)` },
    })
    expect(davWithToken.status()).toBe(201)

    const unlock = await request.fetch(davURL(lockedFile), {
      method: 'UNLOCK', headers: { Authorization: basicAuth, 'Lock-Token': `<${lockToken}>` },
    })
    expect(unlock.status()).toBe(204)
    lockToken = ''

    const completed = await signedS3Request(
      request, credentials, 'POST', lockedFile, completeBody, [['uploadId', uploadID]],
      { 'Content-Type': 'application/xml' },
    )
    expect(completed.status()).toBe(200)
    expect(xmlValue(await completed.text(), 'ETag')).toMatch(/^"[0-9a-f]{32}-1"$/)

    const missingUpload = await signedS3Request(
      request, credentials, 'GET', lockedFile, Buffer.alloc(0), [['uploadId', uploadID]],
    )
    expect(missingUpload.status()).toBe(404)
    expect(await missingUpload.text()).toContain('<Code>NoSuchUpload</Code>')
    uploadID = ''

    const davRead = await request.get(davURL(lockedFile), { headers: { Authorization: basicAuth } })
    expect(davRead.status()).toBe(200)
    expect(await davRead.body()).toEqual(multipartBody)

    await login(page, credentials.username, 'OmniStore-Test-Demo!')
    await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
    await expect(page.getByRole('row', { name: new RegExp(lockedFile) })).toBeVisible()

    const abortInitiated = await signedS3Request(
      request, credentials, 'POST', abortedFile, Buffer.alloc(0), [['uploads', '']],
    )
    expect(abortInitiated.status()).toBe(200)
    abortUploadID = xmlValue(await abortInitiated.text(), 'UploadId')
    const aborted = await signedS3Request(
      request, credentials, 'DELETE', abortedFile, Buffer.alloc(0), [['uploadId', abortUploadID]],
    )
    expect(aborted.status()).toBe(204)
    abortUploadID = ''
  } finally {
    if (lockToken) {
      await request.fetch(davURL(lockedFile), {
        method: 'UNLOCK', headers: { Authorization: basicAuth, 'Lock-Token': `<${lockToken}>` },
      }).catch(() => undefined)
    }
    if (uploadID) {
      await signedS3Request(
        request, credentials, 'DELETE', lockedFile, Buffer.alloc(0), [['uploadId', uploadID]],
      ).catch(() => undefined)
    }
    if (abortUploadID) {
      await signedS3Request(
        request, credentials, 'DELETE', abortedFile, Buffer.alloc(0), [['uploadId', abortUploadID]],
      ).catch(() => undefined)
    }
    await signedS3Request(request, credentials, 'DELETE', lockedFile).catch(() => undefined)
    await signedS3Request(request, credentials, 'DELETE', abortedFile).catch(() => undefined)
  }
})

test('WebDAV and S3 expose the complete supported protocol surface', async ({ page, request }) => {
  const credentials = loadProtocolCredentials()
  test.skip(!credentials, '需要默认测试环境或 OMNISTORE_E2E_PROTOCOL_CREDENTIALS')
  if (!credentials) return

  const directory = `e2e-methods-${Date.now()}`
  const sourceFile = `${directory}/source.txt`
  const movedFile = `${directory}/moved.txt`
  const copiedFile = `${directory}/copied.txt`
  const contents = Buffer.from('0123456789')
  const basicAuth = `Basic ${Buffer.from(`${credentials.username}:${credentials.webdav_token}`).toString('base64')}`
  const davURL = (name: string) => `${credentials.http_endpoint}/dav/${credentials.team_bucket}/${name}`
  const bucketPath = `/${awsEncode(credentials.team_bucket)}`
  let directoryExists = false

  try {
    const mkcol = await request.fetch(davURL(directory), {
      method: 'MKCOL', headers: { Authorization: basicAuth },
    })
    expect(mkcol.status()).toBe(201)
    directoryExists = true

    const put = await request.put(davURL(sourceFile), {
      data: contents, headers: { Authorization: basicAuth },
    })
    expect(put.status()).toBe(201)

    const head = await request.head(davURL(sourceFile), { headers: { Authorization: basicAuth } })
    expect(head.status()).toBe(200)
    expect(head.headers()['content-length']).toBe(`${contents.length}`)

    const copy = await request.fetch(davURL(sourceFile), {
      method: 'COPY',
      headers: { Authorization: basicAuth, Destination: davURL(copiedFile) },
    })
    expect(copy.status()).toBe(501)
    const missingCopy = await request.get(davURL(copiedFile), { headers: { Authorization: basicAuth } })
    expect(missingCopy.status()).toBe(404)

    const move = await request.fetch(davURL(sourceFile), {
      method: 'MOVE',
      headers: { Authorization: basicAuth, Destination: davURL(movedFile), Overwrite: 'F' },
    })
    expect(move.status()).toBe(201)
    const missingSource = await request.get(davURL(sourceFile), { headers: { Authorization: basicAuth } })
    expect(missingSource.status()).toBe(404)

    const buckets = await signedS3PathRequest(request, credentials, 'GET', '/')
    expect(buckets.status()).toBe(200)
    expect(await buckets.text()).toContain(`<Name>${credentials.team_bucket}</Name>`)

    const bucketHead = await signedS3PathRequest(request, credentials, 'HEAD', bucketPath)
    expect(bucketHead.status()).toBe(200)

    const objectHead = await signedS3Request(request, credentials, 'HEAD', movedFile)
    expect(objectHead.status()).toBe(200)
    expect(objectHead.headers()['content-length']).toBe(`${contents.length}`)
    expect(objectHead.headers()['accept-ranges']).toBe('bytes')

    const range = await signedS3Request(
      request, credentials, 'GET', movedFile, Buffer.alloc(0), [], { Range: 'bytes=2-5' },
    )
    expect(range.status()).toBe(206)
    expect(range.headers()['content-range']).toBe(`bytes 2-5/${contents.length}`)
    expect(await range.text()).toBe('2345')

    const listed = await signedS3PathRequest(
      request, credentials, 'GET', bucketPath, Buffer.alloc(0),
      [['list-type', '2'], ['prefix', `${directory}/`]],
    )
    expect(listed.status()).toBe(200)
    expect(await listed.text()).toContain(`<Key>${movedFile}</Key>`)

    const presignedURL = presignedS3GetURL(credentials, movedFile)
    const presigned = await request.get(presignedURL)
    expect(presigned.status()).toBe(200)
    expect(await presigned.body()).toEqual(contents)
    const tamperedURL = new URL(presignedURL)
    tamperedURL.searchParams.set('X-Amz-Signature', '0'.repeat(64))
    const tampered = await request.get(tamperedURL.toString())
    expect(tampered.status()).toBe(403)
    expect(await tampered.text()).toContain('<Code>SignatureDoesNotMatch</Code>')

    const objectACL = await signedS3Request(
      request, credentials, 'GET', movedFile, Buffer.alloc(0), [['acl', '']],
    )
    expect(objectACL.status()).toBe(501)
    expect(await objectACL.text()).toContain('<Code>NotImplemented</Code>')
    const bucketACL = await signedS3PathRequest(
      request, credentials, 'HEAD', bucketPath, Buffer.alloc(0), [['acl', '']],
    )
    expect(bucketACL.status()).toBe(501)

    await login(page, credentials.username, 'OmniStore-Test-Demo!')
    await page.getByRole('button', { name: '打开存储源 团队文件' }).click()
    await expect(page.getByRole('row', { name: new RegExp(directory) })).toBeVisible()

    const deleteBody = Buffer.from(`<Delete><Object><Key>${movedFile}</Key></Object></Delete>`)
    const deleted = await signedS3PathRequest(
      request, credentials, 'POST', bucketPath, deleteBody, [['delete', '']],
      { 'Content-Type': 'application/xml' },
    )
    expect(deleted.status()).toBe(200)
    expect(await deleted.text()).toContain(`<Key>${movedFile}</Key>`)
    const missingObject = await signedS3Request(request, credentials, 'GET', movedFile)
    expect(missingObject.status()).toBe(404)
    expect(await missingObject.text()).toContain('<Code>NoSuchKey</Code>')

    const deleteDirectory = await request.delete(davURL(directory), { headers: { Authorization: basicAuth } })
    expect(deleteDirectory.status()).toBe(204)
    directoryExists = false
    await page.reload()
    await expect(page.getByRole('row', { name: new RegExp(directory) })).toHaveCount(0)
  } finally {
    await signedS3Request(request, credentials, 'DELETE', sourceFile).catch(() => undefined)
    await signedS3Request(request, credentials, 'DELETE', movedFile).catch(() => undefined)
    await signedS3Request(request, credentials, 'DELETE', copiedFile).catch(() => undefined)
    if (directoryExists) {
      await request.delete(davURL(directory), { headers: { Authorization: basicAuth } }).catch(() => undefined)
    }
  }
})
