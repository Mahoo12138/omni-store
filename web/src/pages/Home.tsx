import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@fluentui/react-components'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicSummary } from '../api/public'
import { PublicFrame } from '../components/shell/PublicFrame'
import { Banner } from '../components/shell/Banner'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/shell/PageHeader'
import { StateView } from '../components/shell/StateView'
import { IconFolderFilled, IconHardDrive } from '../components/ui/Icon'
import { useStyles } from './Home.styles'

// 公开网盘首页：2.0 起全站单一公开 Source，展示其入口卡片。
export function HomePage() {
  const css = useStyles()
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
    <PublicFrame>
      <PageHeader
        title="公开网盘"
        description="这里收录此实例开放共享的目录。"
        actions={
          summary.isPending ? null : (
            <Badge
              appearance="tint"
              color={summary.isError || !summary.data?.enabled ? 'warning' : 'success'}
            >
              {summary.isError ? '目录暂不可用' : summary.data?.enabled ? '已开放' : '未开放'}
            </Badge>
          )
        }
      />

      <section className={css.directoryPanel} aria-label="公开目录">
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
          <StateView
            kind="unavailable"
            icon={<IconFolderFilled size={22} />}
            title="公开网盘尚未开启"
            description="管理员在「系统设置 → 站点配置 → 站点服务」中绑定公开网盘存储源后，文件入口会出现在这里。"
          />
        )}
        {summary.isError && (
          <Banner
            intent="error"
            title="无法读取公开目录"
            action={<Button variant="secondary" onClick={() => summary.refetch()}>重新加载目录</Button>}
          >请检查网络连接后重新加载。</Banner>
        )}
        {summary.isSuccess && summary.data.enabled && (
          <div className={css.mountGrid}>
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
      </section>
    </PublicFrame>
  )
}
