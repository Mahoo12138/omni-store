import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSetupStatus } from '../api/auth'
import { fetchPublicMounts } from '../api/public'
import * as css from './Home.css'
import * as fm from './FileManager.css'

// 公开网盘首页（README §12.1）。首次启动未初始化时引导到 /setup。
export function HomePage() {
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })
  const mounts = useQuery({ queryKey: ['public-mounts'], queryFn: fetchPublicMounts })

  useEffect(() => {
    if (setup.data && !setup.data.initialized) {
      navigate({ to: '/setup' })
    }
  }, [setup.data, navigate])

  return (
    <div className={css.page}>
      <header className={css.header}>
        <span className={css.logo}>OmniStore</span>
        <nav className={css.headerNav}>
          <Link to="/upload">公共图床</Link>
          <Link to="/login">登录</Link>
        </nav>
      </header>
      <main className={css.main}>
        <h1 className={css.title}>公开网盘</h1>
        {mounts.isSuccess && mounts.data.length === 0 && (
          <div className={css.card}>
            <p className={css.muted}>暂时没有公开的目录。</p>
          </div>
        )}
        <div className={fm.cardGrid}>
          {mounts.data?.map((m) => (
            <Link
              key={m.mount_path}
              to="/p/$"
              params={{ _splat: m.mount_path.replace(/^\//, '') }}
              className={fm.sourceCard}
            >
              <div className={fm.sourceCardTitle}>📁 {m.name}</div>
              <div className={fm.muted}>{m.description || m.mount_path}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
