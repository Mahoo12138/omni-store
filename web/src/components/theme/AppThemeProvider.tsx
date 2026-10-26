import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { FluentProvider } from '@fluentui/react-components'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus } from '../../api/auth'
import { fetchPreferences, updatePreferences } from '../../api/preferences'
import { appDarkTheme, appLightTheme } from '../../styles/fluentTheme'
import { themeStore, useTheme } from '../../utils/useTheme'
import { toastError } from '../ui/Toast'

// 主题外壳：把解析后的深浅档位交给 FluentProvider，同时接通服务端偏好。
// 层级要求：它在 QueryClientProvider 之内、RouterProvider 之外，
// 因此账号侧的偏好读写不会牵动路由与 toaster 的挂载顺序。
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme()
  const auth = useQuery({ queryKey: ['auth-status'], queryFn: fetchAuthStatus, retry: false, staleTime: 60_000 })
  const authenticated = auth.data?.authenticated === true
  const preferences = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: fetchPreferences,
    enabled: authenticated,
    retry: false,
    staleTime: Infinity,
  })

  // 服务端偏好为主：登录后一次性覆盖本地值。adoptFromServer 同时写回 localStorage，
  // 于是下一帧冷启动由 index.html 内联脚本直接命中正确底色，不会先白后黑。
  useEffect(() => {
    const theme = preferences.data?.theme
    if (theme) themeStore.adoptFromServer(theme)
  }, [preferences.data])

  // 只有登录态才有写回通道；匿名访客的选择留在本地。
  useEffect(() => {
    if (!authenticated) {
      themeStore.setSynchronizer(null)
      return
    }
    themeStore.setSynchronizer(async (mode) => {
      try {
        await updatePreferences(mode)
      } catch {
        // 写回失败不影响本次换肤，只是换设备后不会跟随。
        toastError('主题偏好保存失败，本次仍然生效')
      }
    })
    return () => themeStore.setSynchronizer(null)
  }, [authenticated])

  return (
    <FluentProvider theme={resolved === 'dark' ? appDarkTheme : appLightTheme} applyStylesToPortals>
      {children}
    </FluentProvider>
  )
}
