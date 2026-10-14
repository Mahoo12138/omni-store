import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus } from '../../api/auth'
import { IconCloud, IconFolder, IconGrid, IconImage, IconUser } from '../ui/Icon'
import * as css from './PublicNavigation.css'

// Public pages share one set of destinations, account state and button styles.
export function PublicNavigation({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { pathname } = useLocation()
  const disk = pathname === '/' || pathname.startsWith('/public/')
  const upload = pathname === '/upload'
  const transfer = pathname === '/transfer' || pathname.startsWith('/pickup/') || pathname.startsWith('/collect/')
  const auth = useQuery({ queryKey: ['auth-status'], queryFn: fetchAuthStatus, retry: false, staleTime: 60_000 })

  return (
    <nav className={`${css.navigation} ${tone === 'dark' ? css.dark : css.light}`} aria-label="主导航">
      <Link to="/" activeOptions={{ exact: true }} className={css.link} aria-current={disk ? 'page' : undefined}><IconFolder size={14} />公开网盘</Link>
      <Link to="/upload" activeOptions={{ exact: true }} className={css.link} aria-current={upload ? 'page' : undefined}><IconImage size={14} />匿名图床</Link>
      <Link to="/transfer" search={{ view: 'send' }} activeOptions={{ exact: true }} className={css.link} aria-current={transfer ? 'page' : undefined}><IconCloud size={14} />文件中转</Link>
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
