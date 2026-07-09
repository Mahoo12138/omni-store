import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMySources } from '../api/sources'
import { AppShell } from '../components/layout/AppShell'
import * as css from './FileManager.css'

// /app：登录用户可访问的存储源列表（README §13.1）。
export function AppHomePage() {
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })

  return (
    <AppShell>
      <h1 className={css.pageTitle}>我的网盘</h1>
      {sources.isSuccess && sources.data.length === 0 && (
        <p className={css.muted}>还没有可访问的存储源，请联系管理员分配权限。</p>
      )}
      <div className={css.cardGrid}>
        {sources.data?.map((s) => (
          <Link
            key={s.source_id}
            to="/app/sources/$sourceId"
            params={{ sourceId: s.source_id }}
            search={{ path: '/', page: 1 }}
            className={css.sourceCard}
          >
            <div className={css.sourceCardTitle}>📦 {s.name}</div>
            <div className={css.muted}>
              {s.permission === 'read_write' ? '读写' : '只读'}
              {s.description ? ` · ${s.description}` : ''}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
