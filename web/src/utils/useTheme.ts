import { useSyncExternalStore } from 'react'
import { themeStore, type ThemeMode, type ThemeSnapshot } from './themeMode'

/**
 * 订阅全局主题存储：`mode` 是用户所选档位，`resolved` 是实际生效的深浅。
 * 任何组件调用 setMode 都会让全站重新解析并让 FluentProvider 换主题。
 */
export function useTheme(): ThemeSnapshot {
  return useSyncExternalStore(
    (listener) => themeStore.subscribe(listener),
    () => themeStore.getSnapshot(),
    () => themeStore.getSnapshot(),
  )
}

export function setThemeMode(mode: ThemeMode): void {
  themeStore.setMode(mode)
}

export { themeStore }
