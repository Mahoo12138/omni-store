import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../api/auth'
import { fetchMySources } from '../api/sources'
import { fetchMyActivity } from '../api/activity'
import { AppShell } from '../components/layout/AppShell'
import { Badge } from '../components/ui/Badge'
import {
  IconChevronRight,
  IconCloud,
  IconFolderPlus,
  IconGlobe,
  IconImage,
  IconPlus,
  IconServer,
  IconUpload,
} from '../components/ui/Icon'
import { IconTile } from '../components/ui/Icon'
import { tileOf } from '../styles/tiles'
import { vars } from '../styles/theme.css'
import * as css from './Dashboard.css'

// /app 仪表盘（docs/home.png）：欢迎区 + 存储源卡片网格 + 右栏快速操作 / 最近活动。
export function AppHomePage() {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const activity = useQuery({
    queryKey: ['my-activity'],
    queryFn: () => fetchMyActivity(8),
    retry: false,
  })

  return (
    <AppShell title="我的存储源">
      <div className={css.layout}>
        {/* 左中：欢迎 + 存储源网格 */}
        <div className={css.mainCol}>
          <section className={css.welcome}>
            <div className={css.welcomeIcon}>
              <IconCloud size={32} />
            </div>
            <div className={css.welcomeText}>
              <h2 className={css.welcomeTitle}>
                欢迎回来，{me.data?.display_name ?? '访客'}
              </h2>
              <p className={css.welcomeSub}>
                快速访问你所有权限的存储源，并开始管理文件和图片。
              </p>
            </div>
          </section>

          <div>
            <div className={css.sectionHeader}>
              <h3 className={css.sectionTitle}>
                我的存储源
                <span className={css.sectionCount}>({sources.data?.length ?? 0})</span>
              </h3>
            </div>

            {sources.isSuccess && sources.data.length === 0 && (
              <div className={css.emptyBox}>
                <div className={css.emptyBoxTitle}>还没有可访问的存储源</div>
                <div>请联系管理员为你的账号分配存储源权限。</div>
              </div>
            )}

            <div className={css.sourceGrid}>
              {sources.data?.map((s) => {
                const tile = tileOf(s.source_id)
                return (
                  <Link
                    key={s.source_id}
                    to="/app/sources/$sourceId"
                    params={{ sourceId: s.source_id }}
                    search={{ path: '/', page: 1 }}
                    className={css.sourceCard}
                  >
                    <div className={css.sourceHead}>
                      <IconTile bg={tile.bg} fg={tile.fg}>
                        <IconServer size={22} />
                      </IconTile>
                      <div className={css.sourceInfo}>
                        <h4 className={css.sourceName}>{s.name}</h4>
                        {s.description && (
                          <p className={css.sourceDesc}>{s.description}</p>
                        )}
                      </div>
                    </div>
                    <div className={css.sourceFoot}>
                      <div className={css.badgeRow}>
                        <Badge color={s.permission === 'read_write' ? 'blue' : 'gray'}>
                          {s.permission === 'read_write' ? '读写' : '只读'}
                        </Badge>
                        {s.webdav_enabled && <Badge color="gray">WebDAV</Badge>}
                        {s.image_bed_enabled && <Badge color="purple">图床</Badge>}
                        {s.public_read_enabled && <Badge color="green">公开</Badge>}
                      </div>
                      <IconChevronRight className={css.chevron} size={16} />
                    </div>
                  </Link>
                )
              })}
              {/* 管理员入口：跳到存储源管理 */}
              {me.data?.role === 'super_admin' && (
                <button
                  type="button"
                  className={css.addCard}
                  onClick={() => navigate({ to: '/admin' })}
                >
                  <IconPlus size={20} />
                  <span className={css.addCardLabel}>添加存储源</span>
                  <span className={css.addCardHint}>连接新的存储位置以集中管理</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 右栏：快速操作 + 最近活动 */}
        <aside className={css.sideCol}>
          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h3 className={css.panelTitle}>快速操作</h3>
            </div>
            <button
              type="button"
              className={css.quickAction}
              onClick={() => {
                const first = sources.data?.find((s) => s.permission === 'read_write')
                if (first) {
                  navigate({
                    to: '/app/sources/$sourceId',
                    params: { sourceId: first.source_id },
                    search: { path: '/', page: 1 },
                  })
                } else {
                  navigate({ to: '/app/image-bed' })
                }
              }}
            >
              <IconTile bg={vars.color.tileBlueBg} fg={vars.color.tileBlueFg}>
                <IconUpload size={18} />
              </IconTile>
              <span className={css.quickActionBody}>
                <span className={css.quickActionTitle}>上传文件</span>
                <span className={css.quickActionDesc}>将文件上传到你的存储源</span>
              </span>
              <IconChevronRight className={css.chevron} size={16} />
            </button>
            <button
              type="button"
              className={css.quickAction}
              onClick={() => {
                const first = sources.data?.find((s) => s.permission === 'read_write')
                if (first) {
                  navigate({
                    to: '/app/sources/$sourceId',
                    params: { sourceId: first.source_id },
                    search: { path: '/', page: 1 },
                  })
                } else {
                  navigate({ to: '/app/image-bed' })
                }
              }}
            >
              <IconTile bg={vars.color.tileGreenBg} fg={vars.color.tileGreenFg}>
                <IconFolderPlus size={18} />
              </IconTile>
              <span className={css.quickActionBody}>
                <span className={css.quickActionTitle}>创建文件夹</span>
                <span className={css.quickActionDesc}>在选定的存储源中创建新目录</span>
              </span>
              <IconChevronRight className={css.chevron} size={16} />
            </button>
            <Link to="/app/image-bed" className={css.quickAction}>
              <IconTile bg={vars.color.tilePurpleBg} fg={vars.color.tilePurpleFg}>
                <IconImage size={18} />
              </IconTile>
              <span className={css.quickActionBody}>
                <span className={css.quickActionTitle}>打开图床</span>
                <span className={css.quickActionDesc}>管理你的图片并获取外链</span>
              </span>
              <IconChevronRight className={css.chevron} size={16} />
            </Link>
            <Link to="/" className={css.quickAction}>
              <IconTile bg={vars.color.tileTealBg} fg={vars.color.tileTealFg}>
                <IconGlobe size={18} />
              </IconTile>
              <span className={css.quickActionBody}>
                <span className={css.quickActionTitle}>查看公开网盘</span>
                <span className={css.quickActionDesc}>浏览已公开的文件与目录</span>
              </span>
              <IconChevronRight className={css.chevron} size={16} />
            </Link>
          </section>

          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h3 className={css.panelTitle}>最近活动</h3>
              {activity.data && activity.data.length > 0 && (
                <Link to="/admin/audit-logs" className={css.panelLink}>
                  查看全部
                </Link>
              )}
            </div>
            {activity.isPending && <div className={css.activityEmpty}>加载中…</div>}
            {activity.isError && <div className={css.activityEmpty}>暂无活动记录</div>}
            {activity.isSuccess && activity.data.length === 0 && (
              <div className={css.activityEmpty}>最近还没有操作记录</div>
            )}
            {activity.isSuccess && activity.data.length > 0 && (
              <div className={css.activityList}>
                {activity.data.map((a) => {
                  const tone = tileOf(a.id + a.action)
                  return (
                    <div key={a.id} className={css.activityRow}>
                      <IconTile bg={tone.bg} fg={tone.fg} size={32}>
                        {activityIcon(a.action)}
                      </IconTile>
                      <span className={css.activityBody}>
                        <span className={css.activityTitle}>{a.title}</span>
                        <span className={css.activityMeta}>
                          {a.source_name ? `在 ${a.source_name}` : ''}
                        </span>
                      </span>
                      <span className={css.activityTime}>{formatRelative(a.created_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  )
}

function activityIcon(action: string) {
  if (action.startsWith('image')) return <IconImage size={16} />
  if (action.startsWith('folder')) return <IconFolderPlus size={16} />
  if (action.startsWith('file')) return <IconUpload size={16} />
  return <IconServer size={16} />
}

// 时间格式化为"2 分钟前 / 1 小时前 / 昨天 / 3 天前 / 直接显示日期"
function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`
  if (diffSec < 86400 * 2) return '昨天'
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
