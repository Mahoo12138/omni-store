import { describe, expect, it, vi } from 'vitest'
import {
  applyThemeToDocument,
  createThemeStore,
  isThemeMode,
  readStoredThemeMode,
  resolveTheme,
  THEME_MODE_STORAGE_KEY,
  writeStoredThemeMode,
  type ThemeStoreDependencies,
} from './themeMode'

// 主题解析与存储是"系统深色 → 全站跟随 + 手动三档刷新后保持"这条验收的实现内核：
// index.html 的内联脚本、FluentProvider 的 theme 选择、meta theme-color 的 media 改写
// 都依赖这里的纯函数，所以在 node 环境下直接测逻辑，不依赖 jsdom。

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

function fakeMedia(matches: boolean, listeners: Array<(event: { matches: boolean }) => void> = []) {
  return {
    matches,
    listeners,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      listeners.push(listener)
    },
  }
}

describe('isThemeMode / resolveTheme', () => {
  it('accepts only the three documented modes', () => {
    for (const value of ['light', 'dark', 'system']) expect(isThemeMode(value)).toBe(true)
    for (const value of ['AUTO', '', 'prefer-dark', undefined, null, 1]) expect(isThemeMode(value)).toBe(false)
  })

  it('lets the system decision drive only the system档', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('localStorage 边界', () => {
  it('reads the stored mode and falls back to null when absent or非法', () => {
    expect(readStoredThemeMode(fakeStorage({ [THEME_MODE_STORAGE_KEY]: 'dark' }))).toBe('dark')
    expect(readStoredThemeMode(fakeStorage({ [THEME_MODE_STORAGE_KEY]: 'nope' }))).toBeNull()
    expect(readStoredThemeMode(fakeStorage())).toBeNull()
  })

  it('treats a throwing storage as unset instead of crashing', () => {
    const hostile = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceeded') },
    }
    expect(readStoredThemeMode(hostile)).toBeNull()
    expect(() => writeStoredThemeMode('dark', hostile)).not.toThrow()
  })

  it('writes through the shared key', () => {
    const storage = fakeStorage()
    writeStoredThemeMode('light', storage)
    expect(storage.data.get(THEME_MODE_STORAGE_KEY)).toBe('light')
  })
})

describe('applyThemeToDocument', () => {
  function fakeDocument() {
    const metas = [
      { theme: 'light', media: '(prefers-color-scheme: light)' },
      { theme: 'dark', media: '(prefers-color-scheme: dark)' },
    ]
    const root = { dataset: {} as Record<string, string> }
    return {
      root,
      metas,
      doc: {
        documentElement: root,
        querySelector: (selector: string) => {
          const match = /data-theme="(\w+)"/.exec(selector)
          return match ? metas.find((meta) => meta.theme === match[1]) ?? null : null
        },
      // 只实现被调用到的两个成员，测试里按 Document 结构断言即可。
      } as unknown as Document,
    }
  }

  it('marks the document and makes the chosen theme-color win over the OS', () => {
    const { doc, root, metas } = fakeDocument()
    applyThemeToDocument('dark', doc)
    expect(root.dataset.theme).toBe('dark')
    expect(metas[0].media).toBe('not all')
    expect(metas[1].media).toBe('all')

    applyThemeToDocument('light', doc)
    expect(root.dataset.theme).toBe('light')
    expect(metas[0].media).toBe('all')
    expect(metas[1].media).toBe('not all')
  })

  it('is a no-op without a document (node/test 环境)', () => {
    expect(() => applyThemeToDocument('dark', undefined)).not.toThrow()
  })
})

describe('createThemeStore', () => {
  function makeStore(dependencies: ThemeStoreDependencies = {}) {
    const persisted: string[] = []
    const applied: string[] = []
    const notified: unknown[] = []
    const store = createThemeStore({
      initialMode: dependencies.initialMode ?? 'system',
      media: dependencies.media,
      persist: (mode) => { persisted.push(mode) },
      apply: (resolved) => { applied.push(resolved) },
      notify: (error) => { notified.push(error) },
    })
    return { store, persisted, applied, notified }
  }

  it('starts from the system media query and stays quiet until something changes', () => {
    const { store, persisted, applied } = makeStore({ media: fakeMedia(true) })
    expect(store.getSnapshot()).toEqual({ mode: 'system', resolved: 'dark' })
    expect(persisted).toEqual([])
    expect(applied).toEqual([])
  })

  it('keeps a stable snapshot reference so useSyncExternalStore does not loop', () => {
    const { store } = makeStore({ media: fakeMedia(false) })
    const first = store.getSnapshot()
    store.subscribe(() => undefined)()
    expect(store.getSnapshot()).toBe(first)
  })

  it('persists and applies an explicit choice, then notifies subscribers', () => {
    const { store, persisted, applied } = makeStore({ media: fakeMedia(true) })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setMode('light')
    expect(store.getSnapshot()).toEqual({ mode: 'light', resolved: 'light' })
    expect(persisted).toEqual(['light'])
    expect(applied).toEqual(['light'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows the OS only while the mode is system', () => {
    const media = fakeMedia(false)
    const { store, persisted } = makeStore({ media })

    store.setSystemPreference(true)
    expect(store.getSnapshot()).toEqual({ mode: 'system', resolved: 'dark' })
    expect(persisted).toEqual([])

    store.setMode('light')
    store.setSystemPreference(false)
    expect(store.getSnapshot()).toEqual({ mode: 'light', resolved: 'light' })
  })

  it('lets the server value win on load and still mirrors it locally', () => {
    const { store, persisted } = makeStore({ initialMode: 'light', media: fakeMedia(false) })
    store.adoptFromServer('dark')
    expect(store.getSnapshot().resolved).toBe('dark')
    expect(persisted).toEqual(['dark'])
  })

  it('pushes explicit choices to the synchronizer, not server adoption', async () => {
    const pushed: string[] = []
    const { store } = makeStore({ initialMode: 'system', media: fakeMedia(false) })
    store.setSynchronizer(async (mode) => { pushed.push(mode) })

    store.setMode('dark')
    store.adoptFromServer('light')
    await Promise.resolve()
    expect(pushed).toEqual(['dark'])
    expect(store.getSnapshot().resolved).toBe('light')
  })

  it('survives a failing synchronizer and reports it once', async () => {
    const { store, notified } = makeStore({ initialMode: 'system', media: fakeMedia(false) })
    store.setSynchronizer(async () => { throw new Error('offline') })

    store.setMode('dark')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.getSnapshot().resolved).toBe('dark')
    expect(notified).toHaveLength(1)
  })

  it('ignores非法 modes instead of corrupting the snapshot', () => {
    const { store, persisted } = makeStore({ initialMode: 'system', media: fakeMedia(false) })
    store.setMode('AUTO' as never)
    store.adoptFromServer(undefined as never)
    expect(store.getSnapshot().resolved).toBe('light')
    expect(persisted).toEqual([])
  })
})
