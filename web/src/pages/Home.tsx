import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicSummary } from '../api/public'
import { PublicDriveHero } from '../components/layout/PublicDriveHero'
import { PublicShell } from '../components/layout/PublicShell'
import { IconFolderFilled, IconHardDrive } from '../components/ui/Icon'
import * as css from './Home.css'

// 公开网盘首页：2.0 起全站单一公开 Source，展示其入口卡片。
export function HomePage() {
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const summary = useQuery({ queryKey: ['public-summary'], queryFn: fetchPublicSummary })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  function openPublicDrive() {
    navigate({ to: '/public/$', params: { _splat: '' } })
  }

  return (
    <PublicShell showHeader={false}>
      <PublicDriveHero />

      <section className={css.directorySection} aria-labelledby="directory-index-title">
        <header className={css.directoryHeader}>
          <div>
            <h2 id="directory-index-title">目录索引</h2>
          </div>
          <p>选择目录开始浏览</p>
        </header>

        <div className={css.directoryPanel}>
          {summary.isPending && (
            <div className={css.mountGrid} aria-busy="true" aria-label="正在加载公开目录">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={css.mountSkeleton} aria-hidden="true">
                  <span className={css.mountSkeletonIcon} />
                  <span className={css.mountSkeletonLine} />
                  <span className={css.mountSkeletonLineShort} />
                </div>
              ))}
            </div>
          )}
          {summary.isSuccess && !summary.data.enabled && (
            <div className={css.emptyState}>
              <span className={css.emptyIcon} aria-hidden="true">
                <IconFolderFilled size={30} />
              </span>
              <div>
                <h2>公开网盘尚未开启</h2>
                <p>管理员在「站点服务」中绑定公开盘存储源后，文件入口会出现在这里。</p>
              </div>
            </div>
          )}
          {summary.isError && (
            <div className={css.errorState} role="alert">
              <div>
                <h2>无法读取公开目录</h2>
                <p>请检查网络连接后重新加载。</p>
              </div>
              <button type="button" onClick={() => summary.refetch()}>重新加载目录</button>
            </div>
          )}
          {summary.isSuccess && summary.data.enabled && (
            <div className={css.mountGrid} aria-label="公开目录">
              <button
                key={summary.data.source_key}
                type="button"
                className={css.mountCard}
                onClick={openPublicDrive}
                aria-label={`打开目录 ${summary.data.source_name}`}
              >
                <span className={css.mountCardTop}>
                  <span className={css.mountIcon} aria-hidden="true">
                    <IconHardDrive size={22} />
                  </span>
                  <span className={css.mountKind}>公开目录</span>
                </span>
                <span className={css.mountName}>{summary.data.source_name || '公开网盘'}</span>
                <span className={css.mountDescription}>浏览此实例开放共享的全部文件。</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </PublicShell>
  )
}
