import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchPublicSummary } from '../../api/public'
import { LogoMark } from '../ui/Icon'
import { PublicNavigation } from './PublicNavigation'
import { useStyles } from '../../pages/Home.styles'

// Shared public-drive masthead and introduction for the index and file-browser routes.
export function PublicDriveHero() {
  const css = useStyles()
  const summary = useQuery({ queryKey: ['public-summary'], queryFn: fetchPublicSummary })
  const enabled = summary.data?.enabled ?? false

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
        <PublicNavigation />
      </div>

      <div className={css.heroBody}>
        <div className={css.heroCopy}>
          <span className={css.sectionLabel}>自部署公开文件索引</span>
          <h1 id="public-drive-title">公开网盘</h1>
          <p>这里收录此实例开放共享的目录。选择一个目录，即可浏览或下载其中的文件。</p>
        </div>
        <div className={css.directoryCount} aria-live="polite">
          <strong>{summary.isPending ? '··' : summary.isError ? '—' : enabled ? '已开放' : '未开放'}</strong>
          <span>{summary.isError ? '目录暂不可用' : '公开网盘'}</span>
        </div>
      </div>
    </section>
  )
}
