import type { Theme } from '@fluentui/react-components'
import { appDarkTheme, appLightTheme } from '../../styles/fluentTheme'
import { useTheme } from '../../utils/useTheme'

// 全站唯一一处「解析出的深浅档位 → Fluent 主题对象」的映射。
// AppThemeProvider 与挂在 FluentProvider 子树之外的任务层都用它，
// 否则两处各写一遍三元表达式，换肤时必然漏掉一处。
export function useAppFluentTheme(): Theme {
  const { resolved } = useTheme()
  return resolved === 'dark' ? appDarkTheme : appLightTheme
}
