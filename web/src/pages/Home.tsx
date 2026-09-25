import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicMounts } from '../api/public'
import { PublicDriveHero } from '../components/layout/PublicDriveHero'
import { PublicShell } from '../components/layout/PublicShell'
import { IconChevronRight, IconFolderFilled, IconHardDrive } from '../components/ui/Icon'
import * as css from './Home.css'

// 公开网盘首页：去除全局顶栏，以公开目录索引作为唯一主任务。
export function HomePage() {
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const mounts = useQuery({ queryKey: ['public-mounts'], queryFn: fetchPublicMounts })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  function openMount(path: string) {
    navigate({
      to: '/p/$',
      params: { _splat: path.replace(/^\//, '') },
    })
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
          {mounts.isPending && (
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
          {mounts.isSuccess && mounts.data.length === 0 && (
            <div className={css.emptyState}>
              <span className={css.emptyIcon} aria-hidden="true">
                <IconFolderFilled size={30} />
              </span>
              <div>
                <h2>等待第一个公开目录</h2>
                <p>管理员为存储源启用公开挂载后，文件入口会出现在这里。</p>
              </div>
            </div>
          )}
          {mounts.isError && (
            <div className={css.errorState} role="alert">
              <div>
                <h2>无法读取公开目录</h2>
                <p>请检查网络连接后重新加载。</p>
              </div>
              <button type="button" onClick={() => mounts.refetch()}>重新加载目录</button>
            </div>
          )}
          {mounts.isSuccess && mounts.data.length > 0 && (
            <div className={css.mountGrid} aria-label="公开目录">
              {mounts.data.map((mount) => (
                <button
                  key={mount.mount_path}
                  type="button"
                  className={css.mountCard}
                  onClick={() => openMount(mount.mount_path)}
                  aria-label={`打开目录 ${mount.name}`}
                >
                  <span className={css.mountCardTop}>
                    <span className={css.mountIcon} aria-hidden="true">
                      <IconHardDrive size={22} />
                    </span>
                    <span className={css.mountKind}>公开目录</span>
                    <IconChevronRight size={16} className={css.mountArrow} />
                  </span>
                  <span className={css.mountName}>{mount.name}</span>
                  <span className={css.mountPath}>
                    <span>路径</span>
                    <code>{mount.mount_path}</code>
                  </span>
                  <span className={css.mountDescription}>{mount.description || '未添加说明'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicShell>
  )
}
