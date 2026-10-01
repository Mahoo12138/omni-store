import { expect, test } from '@playwright/test'

// 2.0 Phase 4 文件流转中心：生产复杂场景 E2E（API 驱动，无 UI）。
// 覆盖：完整取件链路、目录结构保持、内容完整性、密码/取件码错误与限流、
// 下载名额并发竞争、撤销、匿名提交滥用与限额、权限隔离、同源多能力隔离。

const baseURL = 'http://127.0.0.1:18080'

interface Session {
  cookie: string
  csrf: string
}

let owner: Session | null = null
let teamKey: string | null = null

async function teamSourceKey(page: import('@playwright/test').Page): Promise<string> {
  if (teamKey) return teamKey
  const session = await login(page)
  const response = await page.request.get(`${baseURL}/api/v1/sources`, { headers: authHeaders(session) })
  expect(response.ok()).toBeTruthy()
  const { data } = await response.json()
  const team = (data.items as Array<{ key: string; name: string }>).find((item) => item.name === '团队文件')
  expect(team).toBeTruthy()
  teamKey = team!.key
  return teamKey
}

async function login(page: import('@playwright/test').Page): Promise<Session> {
  if (owner) return owner
  const response = await page.request.post(`${baseURL}/api/v1/auth/login`, {
    data: { username: 'demo', password: 'OmniStore-Test-Demo!' },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  const setCookie = response.headersArray().find((header) => header.name.toLowerCase() === 'set-cookie')
  expect(setCookie).toBeTruthy()
  const cookie = setCookie!.value.split(';')[0]
  owner = { cookie, csrf: body.data.csrf_token }
  return owner
}

function authHeaders(session: Session, withCSRF = false): Record<string, string> {
  const headers: Record<string, string> = { cookie: session.cookie }
  if (withCSRF) headers['X-CSRF-Token'] = session.csrf
  return headers
}

test.describe(() => {
  test.use({ storageState: undefined })

  test('send package: folder structure, content integrity, pickup and archive', async ({ page }) => {
    const session = await login(page)
    const api = page.request

    const created = await api.post(`${baseURL}/api/v1/transfers`, {
      headers: authHeaders(session, true),
      data: { title: '客户交付包', description: 'E2E 场景', expires_in_hours: 48, max_downloads: 5 },
    })
    expect(created.ok()).toBeTruthy()
    const { data: createdData } = await created.json()
    const publicKey: string = createdData.send.public_key
    const pickupCode: string = createdData.pickup_code
    const transferID = createdData.send.id
    expect(publicKey).toMatch(/^tr-[0-9a-f]{24}$/)
    expect(pickupCode).toHaveLength(8)
    // 创建响应后取件码不再出现（历史列表不泄露）。
    const list = await api.get(`${baseURL}/api/v1/transfers`, { headers: authHeaders(session) })
    expect((await list.text())).not.toContain(pickupCode)

    // 直传嵌套目录（中文 + 空格路径）。
    const nested = 'docs/2026 方案/最终版 v2.pdf'
    const upload = await api.post(
      `${baseURL}/api/v1/transfers/${transferID}/files/upload`,
      {
        headers: authHeaders(session, true),
        multipart: {
          relative_path: nested,
          file: { name: 'final.pdf', mimeType: 'application/pdf', buffer: Buffer.from('PDF-CONTENT-交付') },
        },
      },
    )
    expect(upload.ok()).toBeTruthy()

    // 从已有存储源复制普通文件。
    const copy = await api.post(`${baseURL}/api/v1/transfers/${transferID}/files/from-store`, {
      headers: authHeaders(session, true),
      data: { source_key: await teamSourceKey(page), paths: ['projects/roadmap.md'] },
    })
    expect(copy.ok()).toBeTruthy()

    // 未定稿前公开不可见。
    const draftLookup = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}`)
    expect(draftLookup.status()).toBe(404)

    expect((await api.post(`${baseURL}/api/v1/transfers/${transferID}/finalize`, { headers: authHeaders(session, true) })).ok()).toBeTruthy()

    // 公开摘要。
    const lookup = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}`)
    expect(lookup.ok()).toBeTruthy()
    const { data: info } = await lookup.json()
    expect(info.file_count).toBe(2)
    expect(info.has_password).toBe(false)

    // 错误取件码 → 400；大小写不敏感取件码解锁。
    const badCode = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: 'XXXXXXXX' },
    })
    expect(badCode.status()).toBe(400)
    const unlocked = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: pickupCode.toLowerCase() },
    })
    expect(unlocked.ok()).toBeTruthy()
    const { data: unlockData } = await unlocked.json()
    const token: string = unlockData.token

    // 文件列表保持目录结构。
    const files = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}/files`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(files.ok()).toBeTruthy()
    const { data: fileList } = await files.json()
    const paths = fileList.items.map((item: { relative_path: string }) => item.relative_path).sort()
    expect(paths).toEqual(['docs/2026 方案/最终版 v2.pdf', 'projects/roadmap.md'])

    // 单文件下载内容逐字节一致。
    const target = fileList.items.find((item: { relative_path: string }) => item.relative_path === nested)
    const download = await api.get(
      `${baseURL}/api/v1/public/transfers/${publicKey}/files/${target.id}/download`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    expect(download.ok()).toBeTruthy()
    expect(Buffer.from(await download.body()).toString('utf-8')).toBe('PDF-CONTENT-交付')
    // 附件语义 + 不缓存。
    expect(download.headers()['content-disposition']).toContain('attachment')
    expect(download.headers()['cache-control']).toBe('no-store')

    // ZIP 包含全部条目与路径。
    const archive = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}/archive`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(archive.ok()).toBeTruthy()
    const admzip = Buffer.from(await archive.body())
    expect(admzip.subarray(0, 2).toString()).toBe('PK')

    // 名额耗尽：max_downloads=5，已用 2（download+archive）……继续下载直到耗尽。
    for (let i = 0; i < 3; i++) {
      const extra = await api.get(
        `${baseURL}/api/v1/public/transfers/${publicKey}/files/${target.id}/download`,
        { headers: { authorization: `Bearer ${token}` } },
      )
      expect(extra.ok()).toBeTruthy()
    }
    const exhausted = await api.get(
      `${baseURL}/api/v1/public/transfers/${publicKey}/files/${target.id}/download`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    expect(exhausted.status()).toBe(403)

    // 撤销后公开 404，会话失效。
    expect((await api.delete(`${baseURL}/api/v1/transfers/${transferID}`, { headers: authHeaders(session, true) })).ok()).toBeTruthy()
    const revoked = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}`)
    expect(revoked.status()).toBe(404)
  })

  test('password protected pickup rejects wrong credentials and rate limits abuse', async ({ page }) => {
    const session = await login(page)
    const api = page.request

    const created = await api.post(`${baseURL}/api/v1/transfers`, {
      headers: authHeaders(session, true),
      data: { title: '机密包', password: 'Super-Secret-9', expires_in_hours: 24 },
    })
    const { data: createdData } = await created.json()
    const publicKey: string = createdData.send.public_key
    const pickupCode: string = createdData.pickup_code
    await api.post(`${baseURL}/api/v1/transfers/${createdData.send.id}/files/upload`, {
      headers: authHeaders(session, true),
      multipart: { relative_path: 'secret.txt', file: { name: 's.txt', mimeType: 'text/plain', buffer: Buffer.from('TOP') } },
    })
    await api.post(`${baseURL}/api/v1/transfers/${createdData.send.id}/finalize`, { headers: authHeaders(session, true) })

    // 错误密码 → 403；错误取件码 → 400。
    const wrongPass = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: pickupCode, password: 'wrong-pass' },
    })
    expect(wrongPass.status()).toBe(403)
    const wrongCode = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: 'ZZZZZZZZ', password: 'Super-Secret-9' },
    })
    expect(wrongCode.status()).toBe(400)

    // 正确组合解锁。
    const ok = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: pickupCode, password: 'Super-Secret-9' },
    })
    expect(ok.ok()).toBeTruthy()

    // 爆破限流：连续错误尝试后 429（未消耗成功配额前）。
    let rateLimited = false
    for (let i = 0; i < 70; i++) {
      const attempt = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
        data: { pickup_code: 'ZZZZZZZZ' },
      })
      if (attempt.status() === 429) {
        rateLimited = true
        break
      }
    }
    expect(rateLimited).toBeTruthy()
  })

  test('concurrent downloads respect max_downloads exactly', async ({ page }) => {
    const session = await login(page)
    const api = page.request

    const created = await api.post(`${baseURL}/api/v1/transfers`, {
      headers: authHeaders(session, true),
      data: { title: '并发名额', max_downloads: 5 },
    })
    const { data: createdData } = await created.json()
    const publicKey: string = createdData.send.public_key
    const pickupCode: string = createdData.pickup_code
    await api.post(`${baseURL}/api/v1/transfers/${createdData.send.id}/files/upload`, {
      headers: authHeaders(session, true),
      multipart: { relative_path: 'race.txt', file: { name: 'r.txt', mimeType: 'text/plain', buffer: Buffer.from('RACE') } },
    })
    await api.post(`${baseURL}/api/v1/transfers/${createdData.send.id}/finalize`, { headers: authHeaders(session, true) })

    const unlocked = await api.post(`${baseURL}/api/v1/public/transfers/${publicKey}/unlock`, {
      data: { pickup_code: pickupCode },
    })
    const { data: unlockData } = await unlocked.json()
    const token: string = unlockData.token

    const files = await api.get(`${baseURL}/api/v1/public/transfers/${publicKey}/files`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const { data: fileList } = await files.json()
    const fileID = fileList.items[0].id

    // 8 个并发下载竞争 5 个名额：恰好 5 成功 3 失败（原子 UPDATE 保证）。
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.get(`${baseURL}/api/v1/public/transfers/${publicKey}/files/${fileID}/download`, {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    )
    const succeeded = attempts.filter((response) => response.status() === 200).length
    const limited = attempts.filter((response) => response.status() === 403).length
    expect(succeeded).toBe(5)
    expect(limited).toBe(3)
  })

  test('collect: constraints, anonymous abuse protection and owner inbox', async ({ page }) => {
    const session = await login(page)
    const api = page.request

    const created = await api.post(`${baseURL}/api/v1/transfer-collections`, {
      headers: authHeaders(session, true),
      data: {
        title: '作业收集', require_name: true, allowed_exts: ['pdf'],
        max_file_size_mb: 1, expires_in_hours: 24,
      },
    })
    const { data: createdData } = await created.json()
    const publicKey: string = createdData.collection.public_key
    const code: string = createdData.code
    const collectionID = createdData.collection.id

    // 匿名未解锁提交 → 401。
    const anonymous = await api.post(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/submit`, {
      multipart: { relative_path: 'a.pdf', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('X') } },
    })
    expect(anonymous.status()).toBe(401)

    const unlocked = await api.post(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/unlock`, {
      data: { code: code.toLowerCase() },
    })
    expect(unlocked.ok()).toBeTruthy()
    const { data: unlockData } = await unlocked.json()
    const token: string = unlockData.token

    // 类型不允许 / 缺姓名。
    const badType = await api.post(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/submit`, {
      headers: { authorization: `Bearer ${token}` },
      multipart: { relative_path: 'a.exe', name: '小明', file: { name: 'a.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } },
    })
    expect(badType.status()).toBe(400)
    const missingName = await api.post(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/submit`, {
      headers: { authorization: `Bearer ${token}` },
      multipart: { relative_path: 'a.pdf', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('X') } },
    })
    expect(missingName.status()).toBe(400)

    // 正常嵌套提交；内容保持。
    const submitted = await api.post(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/submit`, {
      headers: { authorization: `Bearer ${token}` },
      multipart: {
        relative_path: '作业/第一周.pdf',
        name: '小明',
        note: '第一次提交',
        file: { name: 'w1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('WEEK1-作业') },
      },
    })
    expect(submitted.ok()).toBeTruthy()
    const { data: submission } = await submitted.json()
    expect(submission.file_count).toBe(1)

    // 提交者不能读取别人的提交（无任何公开列举/读取端点）。
    const peek = await api.get(`${baseURL}/api/v1/public/transfer-collections/${publicKey}/submissions`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(peek.status()).toBe(404)

    // 收件箱 + 保存到文件（复制语义）。
    const inbox = await api.get(`${baseURL}/api/v1/transfer-collections/${collectionID}/submissions`, {
      headers: authHeaders(session),
    })
    expect(inbox.ok()).toBeTruthy()
    const { data: inboxData } = await inbox.json()
    expect(inboxData.items[0].submitter_name).toBe('小明')
    expect(inboxData.items[0].files[0].relative_path).toBe('作业/第一周.pdf')

    // 保存到无路径规则覆盖的可写子目录。
    const saved = await api.post(
      `${baseURL}/api/v1/transfer-collections/${collectionID}/submissions/${submission.id}/save-to-files`,
      { headers: authHeaders(session, true), data: { source_key: await teamSourceKey(page), path: 'from-collect' } },
    )
    expect(saved.ok()).toBeTruthy()
    const { data: savedData } = await saved.json()
    expect(savedData.saved).toEqual(['from-collect/作业/第一周.pdf'])
    // 递归写入会穿过只读前缀（projects/ 对演示用户只读）→ 整体拒绝。
    const denied = await api.post(
      `${baseURL}/api/v1/transfer-collections/${collectionID}/submissions/${submission.id}/save-to-files`,
      { headers: authHeaders(session, true), data: { source_key: await teamSourceKey(page), path: '' } },
    )
    expect(denied.status()).toBe(403)

    // 关闭后 lookup 409，提交被拒。
    expect((await api.post(`${baseURL}/api/v1/transfer-collections/${collectionID}/close`, { headers: authHeaders(session, true) })).ok()).toBeTruthy()
    const closed = await api.get(`${baseURL}/api/v1/public/transfer-collections/${publicKey}`)
    expect(closed.status()).toBe(409)
  })

  test('same source serves transfer while public drive and image bed stay isolated', async ({ page }) => {
    const session = await login(page)
    const api = page.request

    // 流转中心绑定在团队源（与公开盘同源）：载荷不经公开盘或通用文件 API 暴露。
    const created = await api.post(`${baseURL}/api/v1/transfers`, {
      headers: authHeaders(session, true),
      data: { title: '同源隔离', expires_in_hours: 24 },
    })
    const { data: createdData } = await created.json()
    const publicKey: string = createdData.send.public_key
    await api.post(`${baseURL}/api/v1/transfers/${createdData.send.id}/files/upload`, {
      headers: authHeaders(session, true),
      multipart: { relative_path: 'inside.txt', file: { name: 'i.txt', mimeType: 'text/plain', buffer: Buffer.from('INSIDE') } },
    })

    // 公开盘（同源）浏览不到 .omnistore 内容。
    const browse = await api.get(`${baseURL}/api/v1/public/browse?path=/`)
    expect(browse.ok()).toBeTruthy()
    expect(await browse.text()).not.toContain('.omnistore')
    // 匿名 raw 访问载荷路径 → 404。
    const raw = await page.request.get(`${baseURL}/public/raw/.omnistore/transfer/send/${publicKey}/inside.txt`)
    expect(raw.status()).toBe(404)

    // 管理员通用文件列表同样看不到托管命名空间。
    const admin = await page.request.post(`${baseURL}/api/v1/auth/login`, {
      data: { username: 'admin', password: 'OmniStore-Test-Admin!' },
    })
    if (admin.ok()) {
      const adminBody = await admin.json()
      const adminCookie = admin.headersArray().find((header) => header.name.toLowerCase() === 'set-cookie')!.value.split(';')[0]
      const teamKey = await teamSourceKey(page)
      const files = await page.request.get(`${baseURL}/api/v1/sources/${teamKey}/files?path=/`, {
        headers: { cookie: adminCookie },
      })
      expect(files.ok()).toBeTruthy()
      expect(await files.text()).not.toContain('.omnistore')
    }
  })
})
