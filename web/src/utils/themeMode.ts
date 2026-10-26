// 界面外观模式（light / dark / system）的唯一事实来源。
//
// 两层来源在此收口：
// - 服务端 `user_preferences.theme`（GET/PATCH /api/v1/me/preferences）：登录账号跨设备一致，为主；
// - localStorage：冷启动首帧、匿名访客、服务端不可用时的回退。
// 优先级：加载时服务端值覆盖本地值；本地立即生效以保证零闪烁，随后异步写回服务端。
//
// 本模块只做逻辑，不 import React，也不写任何颜色字面量：
// 深浅底色由 global.css 的 `[data-theme]` 规则与 index.html 的两个 theme-color meta 承担。

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** localStorage 键；index.html 的防闪白内联脚本必须与此保持一致。 */
export const THEME_MODE_STORAGE_KEY = 'omnistore:theme-mode'

/** 跟随系统时用于判定的媒体查询。 */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const MODES: ThemeMode[] = ['light', 'dark', 'system']

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface SchemeMediaQueryLike {
  matches: boolean
  addEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void
  removeEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (MODES as string[]).includes(value)
}

function storageOrUndefined(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    // 隐私模式下的 localStorage 访问会直接抛错，回退视为未设置。
    return undefined
  }
}

/** 读取本地已选模式；未设置或值非法时返回 null（由调用方回落到 system）。 */
export function readStoredThemeMode(storage = storageOrUndefined()): ThemeMode | null {
  try {
    const raw = storage?.getItem(THEME_MODE_STORAGE_KEY)
    return isThemeMode(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredThemeMode(mode: ThemeMode, storage = storageOrUndefined()): void {
  try {
    storage?.setItem(THEME_MODE_STORAGE_KEY, mode)
  } catch {
    // 存储不可用不应阻塞换肤：本次会话内仍然生效。
  }
}

/** system 档由操作系统的 prefers-color-scheme 决定。 */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

/**
 * 把解析结果写到文档上：
 * - `documentElement[data-theme]` → global.css 据此切换 color-scheme 与画布底色
 *   （本版 FluentProvider 不写 color-scheme，不设置则暗底上的滚动条与原生表单控件仍是亮皮）；
 * - 两个 theme-color meta 的 `media` 属性 → 手动选择优先于操作系统。
 */
export function applyThemeToDocument(resolved: ResolvedTheme, doc: Document | undefined = globalThis.document): void {
  if (!doc) return
  doc.documentElement.dataset.theme = resolved
  for (const theme of ['light', 'dark'] as const) {
    const meta = doc.querySelector<HTMLMetaElement>(`meta[name="theme-color"][data-theme="${theme}"]`)
    if (meta) meta.media = theme === resolved ? 'all' : 'not all'
  }
}

export interface ThemeSnapshot {
  /** 用户所选档位。 */
  mode: ThemeMode
  /** 解析后的实际主题。 */
  resolved: ResolvedTheme
}

export interface ThemeStore {
  getSnapshot(): ThemeSnapshot
  subscribe(listener: () => void): () => void
  /** 用户显式选择：落本地、即刻生效，再异步写回服务端。 */
  setMode(mode: ThemeMode): void
  /** 服务端值到位后覆盖本地值。 */
  adoptFromServer(mode: ThemeMode): void
  /** 操作系统深浅变化；仅 system 档会改变解析结果。 */
  setSystemPreference(dark: boolean): void
  /** 注册/清除写回函数（未登录时传 null）。 */
  setSynchronizer(synchronizer: ((mode: ThemeMode) => Promise<void>) | null): void
}

export interface ThemeStoreDependencies {
  /** 初始档位，默认读本地存储、回落到 system。 */
  initialMode?: ThemeMode
  media?: SchemeMediaQueryLike
  persist?: (mode: ThemeMode) => void
  apply?: (resolved: ResolvedTheme) => void
  notify?: (error: unknown) => void
}

/**
 * 可注入依赖的主题存储：浏览器用 createBrowserThemeStore()，测试传入假 storage/media。
 * 快照对象做缓存，满足 useSyncExternalStore 对同一状态返回同一引用的要求。
 */
export function createThemeStore(dependencies: ThemeStoreDependencies = {}): ThemeStore {
  const listeners = new Set<() => void>()
  let systemDark = dependencies.media?.matches ?? false
  let mode: ThemeMode = dependencies.initialMode ?? 'system'
  let synchronizer: ((mode: ThemeMode) => Promise<void>) | null = null
  let snapshot: ThemeSnapshot = { mode, resolved: resolveTheme(mode, systemDark) }

  function commit(nextMode: ThemeMode, nextSystemDark: boolean, persist: boolean) {
    mode = nextMode
    systemDark = nextSystemDark
    const next: ThemeSnapshot = { mode, resolved: resolveTheme(mode, systemDark) }
    if (next.mode === snapshot.mode && next.resolved === snapshot.resolved) return
    snapshot = next
    if (persist) dependencies.persist?.(mode)
    dependencies.apply?.(snapshot.resolved)
    for (const listener of Array.from(listeners)) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setMode(nextMode) {
      if (!isThemeMode(nextMode)) return
      commit(nextMode, systemDark, true)
      if (!synchronizer) return
      void Promise.resolve(synchronizer(nextMode)).catch((error: unknown) => {
        // 写回失败只影响跨设备一致性：本地选择保持生效。
        dependencies.notify?.(error)
      })
    },
    adoptFromServer(nextMode) {
      if (!isThemeMode(nextMode)) return
      commit(nextMode, systemDark, true)
    },
    setSystemPreference(dark) {
      commit(mode, dark, false)
    },
    setSynchronizer(next) {
      synchronizer = next
    },
  }
}

/**
 * 浏览器单例：档位来自本地存储，system 档跟随 matchMedia 的当前值与后续变化。
 * 首帧底色由 index.html 的内联脚本提前写好，这里只负责挂载后的状态与订阅。
 */
export function createBrowserThemeStore(): ThemeStore {
  const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_SCHEME_QUERY)
    : undefined
  const store = createThemeStore({
    initialMode: readStoredThemeMode() ?? 'system',
    media,
    persist: (mode) => writeStoredThemeMode(mode),
    apply: (resolved) => applyThemeToDocument(resolved),
  })
  media?.addEventListener?.('change', (event) => store.setSystemPreference(event.matches))
  return store
}

/**
 * 全站共用的主题存储实例。模块加载即与 index.html 内联脚本的判定对齐一次：
 * 两者若因隐私模式、禁用脚本等原因不一致，以这里的解析结果为准。
 */
export const themeStore = createBrowserThemeStore()
applyThemeToDocument(themeStore.getSnapshot().resolved)
