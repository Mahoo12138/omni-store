import type { ComponentType } from 'react'
import type { ThemeMode } from '../../utils/themeMode'
import { IconThemeAuto, IconThemeDark, IconThemeLight } from '../ui/Icon'

// 外观档位的文案与图标只有一份，账号菜单（MenuItemRadio）与后台偏好页（RadioGroup）共用，
// 避免两处措辞漂移；e2e 按这些名字定位，改名要同步 web/e2e/theme-preference.spec.ts。
export interface ThemeOption {
  value: ThemeMode
  label: string
  icon: ComponentType<{ size?: number }>
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: '跟随系统', icon: IconThemeAuto },
  { value: 'light', label: '浅色', icon: IconThemeLight },
  { value: 'dark', label: '深色', icon: IconThemeDark },
]

/** 账号菜单里「外观」二级弹出层的入口标签。 */
export const THEME_MENU_LABEL = '外观'

/** MenuItemRadio 的 name（MenuList 的 checkedValues 键）。 */
export const THEME_MENU_RADIO_NAME = 'theme-mode'

/** 后台偏好页整组的可访问名（e2e 用 getByRole('radiogroup', { name }) 定位）。 */
export const THEME_PREFERENCES_LABEL = '外观主题'
