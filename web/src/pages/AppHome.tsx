import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../api/auth'
import { fetchMySources, type UserSource } from '../api/sources'
import { fetchMyActivity, type ActivityItem } from '../api/activity'
import { fetchSystemStatus, type SystemStatus, type SystemStatusFlag } from '../api/system'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import {
  IconActivity,
  IconCheck,
  IconChevronRight,
  IconFolderFilled,
  IconImage,
  IconPlus,
  IconUpload,
} from '../components/ui/Icon'
import * as css from './Dashboard.css'

export function AppHomePage() {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const activity = useQuery({
    queryKey: ['my-activity'],
    queryFn: () => fetchMyActivity(5),
    retry: false,
  })
  const system = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    staleTime: 60_000,
  })

  const sourceList = sources.data ?? []
  const isAdmin = me.data?.role === 'super_admin'
  const now = new Date()
  const displayName = me.data?.display_name

  function openSource(sourceId: string) {
    navigate({
      to: '/app/sources/$sourceId',
      params: { sourceId },
      search: { path: '/', page: 1 },
    })
  }

  return (
    <AppShell title="文件">
      <header className={css.pageHeader}>
        <div className={css.headerCopy}>
          <time className={css.welcomeDate} dateTime={now.toISOString()}>{formatWelcomeDate(now)}</time>
          <h1 className={css.pageTitle}>{displayName ? `${timeGreeting(now)}，${displayName}` : '我的文件'}</h1>
          <p className={css.pageLead}>
            {sourceList.length > 0
              ? `${sourceList.length} 个存储源已连接，选择一个继续管理文件。`
              : '选择一个存储源，开始管理文件。'}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            onClick={() => navigate({ to: '/app/admin', search: { section: 'sources' } })}
          >
            <IconPlus size={16} />
            新建存储源
          </Button>
        )}
      </header>

      <div className={css.workspace}>
        <div className={css.mainCol}>
          <section aria-labelledby="sources-title">
            <div className={css.sectionHeader}>
              <h2 id="sources-title" className={css.sectionTitle}>存储源</h2>
              {sources.isSuccess && sourceList.length > 0 && (
                <span className={css.sectionMeta}>{sourceList.length} 个可用</span>
              )}
            </div>

            {sources.isPending ? (
              <SourceListLoading />
            ) : sources.isError ? (
              <RetryState
                title="无法加载存储源"
                message="请检查网络连接后重试。"
                onRetry={() => sources.refetch()}
              />
            ) : sourceList.length === 0 ? (
              <NoSourceView isAdmin={isAdmin} />
            ) : (
              <div className={css.sourceList}>
                <div className={css.sourceListHead} aria-hidden="true">
                  <span>存储源名称</span>
                  <span>权限与服务</span>
                  <span>操作</span>
                </div>
                {sourceList.map((source) => (
                  <button
                    type="button"
                    key={source.source_id}
                    className={css.sourceRow}
                    onClick={() => openSource(source.source_id)}
                    aria-label={`打开存储源 ${source.name}`}
                  >
                    <span className={css.sourceIdentity}>
                      <span className={css.sourceIcon}><IconFolderFilled size={28} /></span>
                      <span className={css.sourceText}>
                        <strong>{source.name}</strong>
                        <span>{source.description || '本地目录'}</span>
                      </span>
                    </span>
                    <span className={css.sourceCapabilities}>{capabilities(source)}</span>
                    <span className={css.openAction}>
                      打开 <IconChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <RecentActivity
            items={activity.data ?? []}
            loading={activity.isPending}
            error={activity.isError}
            onRetry={() => activity.refetch()}
            showAll={isAdmin}
          />
        </div>

        <aside className={css.utilityRail} aria-label="快捷操作与服务状态">
          <section className={css.utilitySection}>
            <h2 className={css.utilityTitle}>继续操作</h2>
            <div className={css.quickActions}>
              <button
                type="button"
                className={css.quickAction}
                disabled={sourceList.length === 0}
                onClick={() => sourceList[0] && openSource(sourceList[0].source_id)}
              >
                <span className={css.quickIcon}><IconUpload size={20} /></span>
                <span>
                  <strong>上传文件</strong>
                  <small>{sourceList[0] ? `进入 ${sourceList[0].name}` : '需要先创建存储源'}</small>
                </span>
                <span className={css.quickArrow}><IconChevronRight size={16} /></span>
              </button>
              <Link to="/app/image-bed" className={css.quickAction}>
                <span className={css.quickIcon}><IconImage size={20} /></span>
                <span>
                  <strong>打开图床</strong>
                  <small>上传图片并复制外链</small>
                </span>
                <span className={css.quickArrow}><IconChevronRight size={16} /></span>
              </Link>
            </div>
          </section>
          <SystemStatusPanel
            data={system.data}
            loading={system.isPending}
            error={system.isError}
            onRetry={() => system.refetch()}
          />
        </aside>
      </div>
    </AppShell>
  )
}

function capabilities(source: UserSource): string {
  const parts = [source.permission === 'read_write' ? '读写' : '只读']
  if (source.webdav_enabled) parts.push('WebDAV')
  if (source.image_bed_enabled) parts.push('图床')
  if (source.public_read_enabled) parts.push('公开')
  return parts.join(' · ')
}

function SourceListLoading() {
  return (
    <div className={css.sourceList} role="status" aria-busy="true" aria-label="正在加载存储源">
      {[0, 1, 2].map((item) => (
        <div className={css.sourceSkeleton} key={item} aria-hidden="true">
          <span className={css.skeletonIcon} />
          <span className={css.skeletonText}>
            <i />
            <i />
          </span>
          <span className={css.skeletonMeta} />
        </div>
      ))}
    </div>
  )
}

function RetryState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <div className={css.inlineState} role="alert">
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      <Button variant="secondary" onClick={onRetry}>重新加载</Button>
    </div>
  )
}

function NoSourceView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={css.emptyState}>
      <span className={css.emptyIcon}><IconFolderFilled size={34} /></span>
      <div>
        <h3>{isAdmin ? '创建第一个存储源' : '还没有可用的存储源'}</h3>
        <p>{isAdmin ? '连接服务器上的目录后，就可以上传、整理和共享文件。' : '请联系系统管理员分配访问权限。'}</p>
      </div>
      {isAdmin && (
        <Link to="/app/admin" search={{ section: 'sources' }} className={css.textAction}>
          配置存储源 <IconChevronRight size={15} />
        </Link>
      )}
    </div>
  )
}

function SystemStatusPanel({
  data,
  loading,
  error,
  onRetry,
}: {
  data: SystemStatus | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const flags: Array<{ label: string; value: SystemStatusFlag | undefined }> = [
    { label: 'WebDAV', value: data?.webdav },
    { label: '图床服务', value: data?.file_preview },
    { label: '匿名访问', value: data?.anonymous },
  ]
  const allEnabled = flags.every(({ value }) => value?.enabled)
  return (
    <section className={css.statusSection} aria-labelledby="status-title">
      <div className={css.statusHeader}>
        <h2 id="status-title" className={css.utilityTitle}>服务状态</h2>
        {!loading && data && (
          <span className={allEnabled ? css.runningReady : css.running}>
            {allEnabled ? <IconCheck size={13} /> : <i />}
            {allEnabled ? '全部就绪' : '运行中'}
          </span>
        )}
      </div>
      {loading ? (
        <div className={css.statusSkeleton} role="status" aria-label="正在检查服务状态">
          {[0, 1, 2].map((item) => <i key={item} aria-hidden="true" />)}
        </div>
      ) : error || !data ? (
        <div className={css.compactError} role="alert">
          <span>暂时无法读取状态</span>
          <button type="button" onClick={onRetry}>重新检查</button>
        </div>
      ) : (
        <div className={css.statusList}>
          {flags.map(({ label, value }) => (
            <div className={css.statusRow} key={label}>
              <span>{label}</span>
              <span>{value?.status ?? '未知'} <i className={value?.enabled ? css.dotOn : css.dotOff} /></span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RecentActivity({
  items,
  loading,
  error,
  onRetry,
  showAll,
}: {
  items: ActivityItem[]
  loading: boolean
  error: boolean
  onRetry: () => void
  showAll: boolean
}) {
  return (
    <section className={css.activitySection} aria-labelledby="activity-title">
      <div className={css.sectionHeader}>
        <h2 id="activity-title" className={css.sectionTitle}>最近活动</h2>
        {showAll && items.length > 0 && (
          <Link to="/app/admin" search={{ section: 'audit' }} className={css.textAction}>查看全部</Link>
        )}
      </div>
      {loading ? (
        <div className={css.activityList} role="status" aria-label="正在加载最近活动">
          {[0, 1, 2].map((item) => (
            <div className={css.activitySkeleton} key={item} aria-hidden="true">
              <i />
              <span><i /><i /></span>
              <i />
            </div>
          ))}
        </div>
      ) : error ? (
        <RetryState
          title="无法加载最近活动"
          message="操作记录暂时不可用。"
          onRetry={onRetry}
        />
      ) : items.length === 0 ? (
        <div className={css.activityEmpty}>这里还很安静。完成上传、整理或共享后，操作记录会显示在这里。</div>
      ) : (
        <div className={css.activityList}>
          {items.map((item) => (
            <div className={css.activityRow} key={item.id}>
              <span className={css.activityIcon}><IconActivity size={16} /></span>
              <span className={css.activityBody}>
                <strong>{activityTitle(item)}</strong>
                <small>{item.source_name ? `在 ${item.source_name}` : '系统操作'}</small>
              </span>
              <time>{formatRelative(item.created_at)}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const activityLabels: Record<string, string> = {
  create_source: '新建存储源',
  update_source: '更新存储源',
  delete_source: '删除存储源',
  enable_source: '启用存储源',
  disable_source: '禁用存储源',
  update_exclude_patterns: '更新排除规则',
  create_user: '创建用户',
  delete_user: '删除用户',
  enable_user: '启用用户',
  disable_user: '禁用用户',
  grant_permission: '分配存储源权限',
  revoke_permission: '移除存储源权限',
  image_upload: '上传图片',
  image_delete: '删除图片',
  delete_anonymous_image: '删除匿名图片',
  upload: '上传文件',
  delete: '删除文件',
  create_folder: '创建文件夹',
  rename: '重命名文件',
  move: '移动文件',
  change_password: '修改密码',
  login_success: '登录成功',
  login_failed: '登录失败',
  reset_token_webdav: '重置 WebDAV Token',
  reset_token_image_bed: '重置图床 Token',
  update_anonymous_image_bed: '更新匿名图床设置',
}

function timeGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function formatWelcomeDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}

function activityTitle(item: ActivityItem): string {
  if (item.title && item.title !== item.action) return item.title
  return activityLabels[item.action] ?? (item.title || '完成了一项操作')
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}
