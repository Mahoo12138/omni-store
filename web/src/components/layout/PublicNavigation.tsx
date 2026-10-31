import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus } from '../../api/auth'
import { IconFolder, IconGrid, IconImage, IconUser } from '../ui/Icon'
import { useStyles } from './PublicNavigation.styles'

// 公开侧页面共用同一组入口、同一套账号状态与同一组链接样式。
export function PublicNavigation() {
  const css = useStyles()
  const { pathname } = useLocation()
  const disk = pathname === '/' || pathname.startsWith('/public/')
  const upload = pathname === '/upload'
  const auth = useQuery({ queryKey: ['auth-status'], queryFn: fetchAuthStatus, retry: false, staleTime: 60_000 })

  return (
    <nav className={css.navigation} aria-label="主导航">
      <Link to="/" activeOptions={{ exact: true }} className={css.link} aria-current={disk ? 'page' : undefined}><IconFolder size={14} />公开网盘</Link>
      <Link to="/upload" activeOptions={{ exact: true }} className={css.link} aria-current={upload ? 'page' : undefined}><IconImage size={14} />匿名图床</Link>
      {auth.isPending ? (
        <span className={`${css.link} ${css.accountPending}`} role="status" aria-label="正在检查登录状态"><IconUser size={14} />检查登录</span>
      ) : auth.data?.authenticated ? (
        <Link to="/app" className={css.link}><IconGrid size={14} />进入工作台</Link>
      ) : (
        <Link to="/login" className={css.link}><IconUser size={14} />管理登录</Link>
      )}
    </nav>
  )
}
