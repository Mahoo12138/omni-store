import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthStatus } from '../../api/auth'
import { fetchPublicMounts } from '../../api/public'
import { IconImage, LogoMark } from '../ui/Icon'
import * as css from '../../pages/Home.css'

// Shared public-drive masthead and introduction for the index and file-browser routes.
export function PublicDriveHero() {
  const mounts = useQuery({ queryKey: ['public-mounts'], queryFn: fetchPublicMounts })
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
    retry: false,
    staleTime: 60_000,
  })
  const mountCount = mounts.data?.length ?? 0

  return (
    <section className={css.archiveHero} aria-labelledby="public-drive-title">
      <div className={css.masthead}>
        <Link to="/" className={css.brand} aria-label="OmniStore 公开网盘首页">
          <LogoMark size={32} />
          <span>
            <strong>OmniStore</strong>
            <small>PUBLIC DRIVE</small>
          </span>
        </Link>
        <div className={css.utilityLinks}>
          <Link to="/upload" className={css.imageBedLink}>
            <IconImage size={16} />
            匿名图床
          </Link>
          {authStatus.isPending ? (
            <span className={css.authPlaceholder} aria-label="正在检查登录状态" />
          ) : authStatus.data?.authenticated ? (
            <Link to="/app" className={css.authLink}>进入工作台</Link>
          ) : (
            <Link to="/login" className={css.authLink}>管理登录</Link>
          )}
        </div>
      </div>

      <div className={css.heroBody}>
        <div className={css.heroCopy}>
          <span className={css.sectionLabel}>自部署公开文件索引</span>
          <h1 id="public-drive-title">公开网盘</h1>
          <p>这里收录此实例开放共享的目录。选择一个目录，即可浏览或下载其中的文件。</p>
        </div>
        <div className={css.directoryCount} aria-live="polite">
          <strong>
            {mounts.isPending ? '··' : mounts.isError ? '—' : String(mountCount).padStart(2, '0')}
          </strong>
          <span>{mounts.isError ? '目录暂不可用' : '个公开目录'}</span>
        </div>
      </div>
    </section>
  )
}
