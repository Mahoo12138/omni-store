import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../api/auth'
import { fetchMySources, type UserSource } from '../api/sources'
import { fetchMyActivity, type ActivityItem } from '../api/activity'
import { fetchSystemStatus, type SystemStatus, type SystemStatusFlag } from '../api/system'
import { AppShell } from '../components/layout/AppShell'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { IconTile } from '../components/ui/Icon'
import {
  IconActivity,
  IconCloud,
  IconFolderPlus,
  IconGlobe,
  IconHardDrive,
  IconImage,
  IconLink,
  IconPlus,
  IconServer,
  IconUserPlus,
} from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import { vars } from '../styles/theme.css'
import * as css from './Dashboard.css'

// /app 入口（docs/home-1.png / file-1.png）：
//   - 有存储源：欢迎区 + 4 统计卡 + 存储源概览 + 右栏（系统状态 / 最近审计日志）
//   - 无存储源：file-1.png 风格的简洁空状态（仅居中插画 + 标题 + 描述；管理员/普通用户文案不同）
export function AppHomePage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  if (sources.isPending) {
    return (
      <AppShell title="文件">
        <div style={{ padding: 32, color: vars.color.textSecondary, textAlign: 'center' }}>加载中…</div>
      </AppShell>
    )
  }
  if (sources.isSuccess && sources.data.length === 0) {
    return (
      <AppShell title="文件管理">
        <NoSourceView isAdmin={me.data?.role === 'super_admin'} />
      </AppShell>
    )
  }
  return <WithSourcesView />
}

// --- 有存储源（docs/home-1.png）---

function WithSourcesView() {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const activity = useQuery({
    queryKey: ['my-activity'],
    queryFn: () => fetchMyActivity(6),
    retry: false,
  })
  const system = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    staleTime: 60_000,
  })

  const sourceList = sources.data ?? []
  const publicMountCount = sourceList.filter((s) => s.public_read_enabled).length
  const anonOn = system.data?.anonymous.enabled ?? false
  const usageBytes = 0

  return (
    <AppShell title="我的存储源">
      <div className={css.pageHeader}>
        <h1 className={css.pageTitle}>我的存储源</h1>
        <div className={css.pageActions}>
          <Button
            variant="primary"
            onClick={() => navigate({ to: '/app/admin', search: { section: 'sources' } })}
          >
            <IconPlus size={16} />
            新建存储源
          </Button>
          {me.data?.role === 'super_admin' && (
            <Button
              variant="secondary"
              onClick={() => navigate({ to: '/app/admin', search: { section: 'users' } })}
            >
              <IconUserPlus size={16} />
              创建用户
            </Button>
          )}
        </div>
      </div>

      <div className={css.layout}>
        <div className={css.mainCol}>
          <section className={css.welcome}>
            <div className={css.welcomeIcon}>
              <IconCloud size={32} />
            </div>
            <div className={css.welcomeText}>
              <h2 className={css.welcomeTitle}>
                欢迎回来，{me.data?.display_name ?? me.data?.username ?? '用户'}
              </h2>
              <p className={css.welcomeSub}>
                {sourceList.length === 0
                  ? '当前还没有任何存储源，创建存储源后即可管理文件与访问权限。'
                  : `共 ${sourceList.length} 个存储源，开始管理文件与图片。`}
              </p>
            </div>
          </section>

          <div className={css.statRow}>
            <StatCard
              label="存储源"
              value={sourceList.length}
              unit="个"
              iconBg={vars.color.tileBlueBg}
              iconFg={vars.color.tileBlueFg}
            >
              <IconServer size={22} />
            </StatCard>
            <StatCard
              label="公开挂载"
              value={publicMountCount}
              unit="个"
              iconBg={vars.color.tileGreenBg}
              iconFg={vars.color.tileGreenFg}
            >
              <IconGlobe size={22} />
            </StatCard>
            <StatCard
              label="匿名图床"
              value={anonOn ? '已启用' : '未启用'}
              iconBg={vars.color.tilePurpleBg}
              iconFg={vars.color.tilePurpleFg}
            >
              <IconImage size={22} />
            </StatCard>
            <StatCard
              label="存储使用量"
              value={formatBytes(usageBytes)}
              iconBg={vars.color.tileAmberBg}
              iconFg={vars.color.tileAmberFg}
            >
              <IconHardDrive size={22} />
            </StatCard>
          </div>

          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h3 className={css.panelTitle}>存储源概览</h3>
              {sourceList.length > 0 && (
                <Link
                  to="/app/admin"
                  search={{ section: 'sources' }}
                  className={css.sidePanelLink}
                  style={{ fontSize: vars.fontSize.xs }}
                >
                  管理
                </Link>
              )}
            </div>
            {sourceList.length === 0 ? (
              <div className={css.sourceEmpty}>
                <div className={css.sourceEmptyIcon}>
                  <IconFolderPlus size={32} />
                </div>
                <h4 className={css.sourceEmptyTitle}>还没有存储源</h4>
                <p className={css.sourceEmptyDesc}>
                  请先创建第一个存储源，开始管理文件和权限。
                </p>
                <Button
                  variant="primary"
                  onClick={() => navigate({ to: '/app/admin', search: { section: 'sources' } })}
                >
                  <IconPlus size={16} />
                  新建存储源
                </Button>
              </div>
            ) : (
              <SourceTable sources={sourceList} />
            )}
          </section>
        </div>

        <aside className={css.sideCol}>
          <SystemStatusPanel data={system.data} loading={system.isPending} />
          <RecentAuditPanel items={activity.data ?? []} loading={activity.isPending} />
        </aside>
      </div>

      <footer className={css.footer}>© 2024 OmniStore. All rights reserved.</footer>
    </AppShell>
  )
}

// --- 无存储源（docs/file-1.png）：仅居中插画 + 标题 + 描述（无任何操作按钮、无右侧栏）---

function NoSourceView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={css.fileEmptyMain}>
      <div className={css.fileEmptyIllustration}>
        <NoSourceIllustration />
      </div>
      <h2 className={css.fileEmptyTitle}>
        {isAdmin ? '你还没有创建存储源' : '你还没有被分配存储源'}
      </h2>
      <p className={css.fileEmptyHint}>
        {isAdmin
          ? '请前往系统设置创建一个存储源，开始管理文件、图床与权限。'
          : '请联系系统管理员为你分配存储源，或切换到已有访问权限的存储源。'}
      </p>
    </div>
  )
}

// --- 复用 / 共享组件 ---

function StatCard({
  label,
  value,
  unit,
  iconBg,
  iconFg,
  children,
}: {
  label: string
  value: string | number
  unit?: string
  iconBg: string
  iconFg: string
  children: React.ReactNode
}) {
  return (
    <div className={css.statCard}>
      <div className={css.statIcon} style={{ backgroundColor: iconBg, color: iconFg }}>
        {children}
      </div>
      <div className={css.statBody}>
        <span className={css.statLabel}>{label}</span>
        <span className={css.statValue}>
          {value}
          {unit && <span className={css.statUnit}>{unit}</span>}
        </span>
      </div>
    </div>
  )
}

function SourceTable({ sources }: { sources: UserSource[] }) {
  const navigate = useNavigate()
  return (
    <table className={css.compactTable}>
      <thead>
        <tr>
          <th className={css.compactTh}>名称</th>
          <th className={css.compactTh}>权限</th>
          <th className={css.compactTh}>功能</th>
          <th className={css.compactTh}>状态</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => (
          <tr
            key={s.source_id}
            className={css.compactTr}
            onClick={() =>
              navigate({
                to: '/app/sources/$sourceId',
                params: { sourceId: s.source_id },
                search: { path: '/', page: 1 },
              })
            }
          >
            <td className={css.compactTd}>
              <span className={css.compactName}>
                <IconServer size={16} style={{ color: vars.color.textSecondary }} />
                {s.name}
              </span>
            </td>
            <td className={css.compactTd}>
              <Badge color={s.permission === 'read_write' ? 'blue' : 'gray'}>
                {s.permission === 'read_write' ? '读写' : '只读'}
              </Badge>
            </td>
            <td className={css.compactTd}>
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {s.webdav_enabled && <Badge color="gray">WebDAV</Badge>}
                {s.image_bed_enabled && <Badge color="purple">图床</Badge>}
                {s.public_read_enabled && <Badge color="green">公开</Badge>}
                {!s.webdav_enabled && !s.image_bed_enabled && !s.public_read_enabled && (
                  <span style={{ color: vars.color.textSecondary, fontSize: vars.fontSize.xs }}>—</span>
                )}
              </span>
            </td>
            <td className={css.compactTd}>
              <Badge color="green">正常</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SystemStatusPanel({
  data,
  loading,
}: {
  data: SystemStatus | undefined
  loading: boolean
}) {
  if (loading || !data) {
    return (
      <section className={css.sidePanel}>
        <div className={css.sidePanelHeader}>
          <h3 className={css.sidePanelTitle}>系统状态</h3>
        </div>
        <div className={css.activityEmpty}>加载中…</div>
      </section>
    )
  }
  return (
    <section className={css.sidePanel}>
      <div className={css.sidePanelHeader}>
        <h3 className={css.sidePanelTitle}>系统状态</h3>
      </div>
      <div className={css.statusList}>
        <StatusRow title="S3 兼容存储" flag={data.s3} iconBg={vars.color.tileGreenBg} iconFg={vars.color.tileGreenFg}>
          <IconHardDrive size={18} />
        </StatusRow>
        <StatusRow title="WebDAV 服务" flag={data.webdav} iconBg={vars.color.tileBlueBg} iconFg={vars.color.tileBlueFg}>
          <IconLink size={18} />
        </StatusRow>
        <StatusRow
          title="文件预览服务"
          flag={data.file_preview}
          iconBg={vars.color.tilePurpleBg}
          iconFg={vars.color.tilePurpleFg}
        >
          <IconImage size={18} />
        </StatusRow>
        <StatusRow title="匿名访问" flag={data.anonymous} iconBg={vars.color.tileAmberBg} iconFg={vars.color.tileAmberFg}>
          <IconGlobe size={18} />
        </StatusRow>
      </div>
    </section>
  )
}

function StatusRow({
  title,
  flag,
  iconBg,
  iconFg,
  children,
}: {
  title: string
  flag: SystemStatusFlag
  iconBg: string
  iconFg: string
  children: React.ReactNode
}) {
  return (
    <div className={css.statusRow}>
      <IconTile bg={iconBg} fg={iconFg} size={32}>
        {children}
      </IconTile>
      <div className={css.statusBody}>
        <span className={css.statusTitle}>{title}</span>
        <span className={css.statusDesc}>{flag.hint}</span>
      </div>
      <Badge color={flag.enabled ? 'green' : 'gray'}>{flag.status}</Badge>
    </div>
  )
}

function RecentAuditPanel({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  return (
    <section className={css.sidePanel}>
      <div className={css.sidePanelHeader}>
        <h3 className={css.sidePanelTitle}>最近审计日志</h3>
        {items.length > 0 && (
          <Link to="/app/admin" search={{ section: 'audit' }} className={css.sidePanelLink}>
            查看全部
          </Link>
        )}
      </div>
      {loading && <div className={css.activityEmpty}>加载中…</div>}
      {!loading && items.length === 0 && <div className={css.activityEmpty}>最近还没有操作记录</div>}
      {!loading && items.length > 0 && (
        <div className={css.activityList}>
          {items.map((a) => (
            <div key={a.id} className={css.activityRow}>
              <div
                className={css.activityIcon}
                style={{ backgroundColor: vars.color.primarySubtle, color: vars.color.primary }}
              >
                <IconActivity size={16} />
              </div>
              <div className={css.activityBody}>
                <span className={css.activityTitle}>{a.title}</span>
                <span className={css.activityMeta}>
                  {a.source_name ? `在 ${a.source_name}` : '系统操作'}
                </span>
              </div>
              <span className={css.activityTime}>{formatRelative(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

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

// --- 空状态插画（行内 SVG） ---

function NoSourceIllustration() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none" aria-hidden="true">
      <ellipse cx="90" cy="156" rx="58" ry="6" fill="oklch(0.92 0.01 240)" />
      <rect x="56" y="56" width="68" height="80" rx="6" fill="oklch(0.95 0.04 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="2" />
      <rect x="56" y="56" width="68" height="14" rx="6" fill="oklch(0.88 0.08 230)" />
      <rect x="68" y="84" width="44" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <rect x="68" y="98" width="36" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <rect x="68" y="112" width="28" height="6" rx="3" fill="oklch(0.86 0.06 230)" />
      <circle cx="120" cy="50" r="16" fill="oklch(0.93 0.06 230)" stroke="oklch(0.75 0.1 230)" strokeWidth="2" />
      <text x="120" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="oklch(0.55 0.15 230)">?</text>
      <path d="M30 110 q-12 -8 -4 -20" stroke="oklch(0.85 0.06 230)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M150 110 q12 -8 4-20" stroke="oklch(0.85 0.06 230)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}
