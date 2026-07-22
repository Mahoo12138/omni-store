import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiRequestError } from '../../api/client'
import {
  adminCreateSource,
  adminCreateUser,
  adminDeleteSource,
  adminDeleteUser,
  adminFetchAuditLogs,
  adminGetAnonymousSettings,
  adminGetSource,
  adminListPermissions,
  adminListSources,
  adminListUsers,
  adminRemovePermission,
  adminSetAnonymousSettings,
  adminSetExcludePatterns,
  adminSetPermission,
  adminSetSourceDisabled,
  adminSetUserDisabled,
  adminUpdateSource,
  changePassword,
  fetchAdminOverview,
  updateProfile,
  type AdminSource,
  type OverviewSystem,
} from '../../api/admin'
import { fetchMe, type User } from '../../api/auth'
import { fetchTokenStatus, resetToken } from '../../api/imagebed'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DialogWrap } from '../../components/ui/Dialog'
import { Field } from '../../components/ui/Field'
import * as fieldCss from '../../components/ui/Field.css'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import {
  IconActivity,
  IconArrowUp,
  IconGlobe,
  IconImage,
  IconInfo,
  IconKey,
  IconPlus,
  IconServer,
  IconSettings,
  IconTrash,
  IconUser,
  IconUserPlus,
} from '../../components/ui/Icon'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import { vars } from '../../styles/theme.css'
import { formatDate } from '../../utils/format'
import * as css from './AdminOverview.css'

// 系统设置页（docs/settings-layout.png）：左侧分组的子导航 + 右侧多 section。
// 把原 /app/admin、/app/admin/sources、/app/admin/users、/app/admin/audit-logs、
// /app/admin/settings 与 /app/settings 合并到本页。
type SectionKey =
  | 'profile'
  | 'preferences'
  | 'stats'
  | 'sources'
  | 'users'
  | 'audit'
  | 'image-bed'

const baseNav: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: '我的', icon: <IconUser size={15} /> },
  { key: 'preferences', label: '偏好设置', icon: <IconSettings size={15} /> },
]

const auditPageSize = 50
const auditActorOptions = [
  { value: 'all', label: '全部主体' },
  { value: 'user', label: '登录用户' },
  { value: 'anonymous', label: '匿名用户' },
  { value: 'system', label: '系统' },
] as const
const auditEntryOptions = [
  { value: 'all', label: '全部入口' },
  { value: 'web', label: '网页' },
  { value: 'webdav', label: 'WebDAV' },
  { value: 'image_bed', label: '用户图床' },
  { value: 'anonymous_image_bed', label: '匿名图床' },
  { value: 'admin', label: '管理后台' },
  { value: 'cli', label: '命令行' },
] as const
const auditStatusOptions = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
] as const

interface AuditFilters {
  actorType: string
  entryType: string
  status: string
  searchText: string
}

const emptyAuditFilters: AuditFilters = {
  actorType: 'all',
  entryType: 'all',
  status: 'all',
  searchText: '',
}

const adminNav: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'stats', label: '仪表盘', icon: <IconInfo size={15} /> },
  { key: 'sources', label: '存储源', icon: <IconServer size={15} /> },
  { key: 'users', label: '用户', icon: <IconUser size={15} /> },
  { key: 'audit', label: '审计日志', icon: <IconActivity size={15} /> },
  { key: 'image-bed', label: '匿名图床', icon: <IconImage size={15} /> },
]

export function AdminOverviewPage() {
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const section: SectionKey = (adminNav.concat(baseNav).find((n) => n.key === search.section)?.key ??
    'profile') as SectionKey

  function setSection(k: SectionKey) {
    navigate({ to: '/app/admin', search: { section: k } })
  }

  return (
    <AdminLayout>
      <AdminPageHeader title="系统设置" />

      <div className={css.settingsLayout}>
        {/* 左侧分组的子导航 */}
        <nav className={css.settingsSide} aria-label="设置分组">
          <div className={css.settingsGroup}>
            <span className={css.settingsGroupTitle}>基础</span>
            {baseNav.map((item) => (
              <span
                key={item.key}
                className={section === item.key ? css.settingsNavLinkActive : css.settingsNavLink}
                onClick={() => setSection(item.key)}
                role="link"
                aria-current={section === item.key ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </span>
            ))}
          </div>
          <div className={css.settingsGroup}>
            <span className={css.settingsGroupTitle}>管理</span>
            {adminNav.map((item) => (
              <span
                key={item.key}
                className={section === item.key ? css.settingsNavLinkActive : css.settingsNavLink}
                onClick={() => setSection(item.key)}
                role="link"
                aria-current={section === item.key ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </span>
            ))}
          </div>
        </nav>

        {/* 右侧内容 */}
        <div className={css.settingsContent}>
          {section === 'profile' && <ProfileSection />}
          {section === 'preferences' && <PreferencesSection />}
          {section === 'stats' && <StatsSection />}
          {section === 'sources' && <SourcesSection />}
          {section === 'users' && <UsersSection />}
          {section === 'audit' && <AuditSection />}
          {section === 'image-bed' && <ImageBedSection />}
        </div>
      </div>

      <VersionFooter />
    </AdminLayout>
  )
}

// --- 我的（原 /app/settings：个人资料 + 修改密码 + WebDAV/图床 Token）---

function ProfileSection() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const tokens = useQuery({ queryKey: ['token-status'], queryFn: fetchTokenStatus })

  const [profileOpen, setProfileOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [newTokens, setNewTokens] = useState<Record<string, string>>({})

  const profileMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      setProfileMsg('已保存')
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setTimeout(() => { setProfileOpen(false); setProfileMsg('') }, 600)
    },
    onError: (err) => setProfileMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })

  const pwdMut = useMutation({
    mutationFn: ({ o, n }: { o: string; n: string }) => changePassword(o, n),
    onSuccess: () => {
      setPwdMsg('密码已修改')
      setOldPwd('')
      setNewPwd('')
      setTimeout(() => { setPwdOpen(false); setPwdMsg('') }, 600)
    },
    onError: (err) => setPwdMsg(err instanceof ApiRequestError ? err.message : '修改失败'),
  })

  const resetMut = useMutation({
    mutationFn: resetToken,
    onSuccess: (data, type) => {
      setNewTokens((prev) => ({ ...prev, [type]: data.token }))
      queryClient.invalidateQueries({ queryKey: ['token-status'] })
    },
    onError: () => alert('重置失败'),
  })

  function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (displayName.trim()) profileMut.mutate(displayName.trim())
  }
  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    pwdMut.mutate({ o: oldPwd, n: newPwd })
  }

  return (
    <div className={css.profilePage}>
      <section className={css.accountPanel}>
        <div className={css.accountIdentity}>
          <span className={css.accountAvatar} aria-hidden="true">
            {(me.data?.display_name || me.data?.username || 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className={css.accountCopy}>
            <span className={css.eyebrow}>个人账户</span>
            <h2 className={css.accountName}>
              {me.data?.display_name || me.data?.username || '加载中…'}
            </h2>
            <p className={css.accountMeta}>
              <span>@{me.data?.username ?? '-'}</span>
              <span className={css.metaDivider} aria-hidden="true" />
              <span>用户名不可修改</span>
            </p>
          </div>
        </div>
        <div className={css.accountActions}>
          <Button variant="secondary" onClick={() => setProfileOpen(true)}>
            修改显示名
          </Button>
          <Button variant="secondary" onClick={() => setPwdOpen(true)}>
            修改密码
          </Button>
        </div>
      </section>

      {/* 修改显示名 弹窗 */}
      <DialogWrap
        open={profileOpen}
        onOpenChange={(o) => { setProfileOpen(o); if (!o) { setDisplayName(''); setProfileMsg('') } }}
        title="修改显示名"
        description="显示名仅用于界面展示，不影响登录。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>
              取消
            </Button>
            <Button
              onClick={onSaveProfile}
              disabled={profileMut.isPending || !displayName.trim()}
            >
              保存
            </Button>
          </>
        }
      >
        <Field label="新的显示名" required error={profileMsg}>
          <Input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={me.data?.display_name ?? '显示名'}
          />
        </Field>
      </DialogWrap>

      {/* 修改密码 弹窗 */}
      <DialogWrap
        open={pwdOpen}
        onOpenChange={(o) => { setPwdOpen(o); if (!o) { setOldPwd(''); setNewPwd(''); setPwdMsg('') } }}
        title="修改密码"
        description="修改后需要重新登录。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwdOpen(false)}>
              取消
            </Button>
            <Button
              onClick={onChangePassword}
              disabled={pwdMut.isPending || !oldPwd || newPwd.length < 8}
            >
              {pwdMut.isPending ? '修改中…' : '修改密码'}
            </Button>
          </>
        }
      >
        <Field label="旧密码" required>
          <Input
            type="password"
            autoFocus
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field
          label="新密码（至少 8 位）"
          required
          error={pwdMsg}
          hint={pwdMsg ? undefined : '建议使用字母数字符号组合'}
        >
          <Input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </DialogWrap>

      <section className={css.credentialsPanel}>
        <header className={css.credentialsHeader}>
          <div>
            <span className={css.eyebrow}>访问凭据</span>
            <h2 className={css.credentialsTitle}>应用与客户端连接</h2>
          </div>
          <p className={css.credentialsHint}>Token 仅在生成时展示一次，请妥善保存。</p>
        </header>
        <div className={css.tokenList}>
          <TokenBlock
            type="webdav"
            title="WebDAV"
            hint="通过 /dav 挂载文件，使用登录名与此 Token 认证。"
            status={tokens.data?.webdav}
            newToken={newTokens.webdav}
            onReset={(t) => resetMut.mutate(t)}
          />
          <TokenBlock
            type="image-bed"
            title="图床 API"
            hint="用于 PicGo 等客户端上传图片，仅授予图床上传权限。"
            status={tokens.data?.image_bed}
            newToken={newTokens['image-bed']}
            onReset={(t) => resetMut.mutate(t)}
          />
        </div>
      </section>

      {/* 危险操作 */}
      <div className={css.dangerBox}>
        <span className={css.dangerIcon}><IconInfo size={18} /></span>
        <span className={css.dangerText}>
          <strong className={css.dangerTitle}>撤销账号</strong>
          <small className={css.dangerHint}>永久删除账号及其在当前实例内的全部访问权限。</small>
        </span>
        <Button variant="danger" disabled title="即将开放">
          撤销账号
        </Button>
      </div>
    </div>
  )
}

function TokenBlock({
  type,
  title,
  hint,
  status,
  newToken,
  onReset,
}: {
  type: 'webdav' | 'image-bed'
  title: string
  hint: string
  status?: { exists: boolean; created_at?: string | null; last_used_at?: string | null }
  newToken?: string
  onReset: (t: 'webdav' | 'image-bed') => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showOpen, setShowOpen] = useState(false)
  return (
    <article className={css.tokenRow}>
      <div className={css.tokenIcon} aria-hidden="true"><IconKey size={17} /></div>
      <div className={css.tokenCopy}>
        <h3 className={css.tokenTitle}>{title}</h3>
        <p className={css.tokenHint}>{hint}</p>
      </div>
      <div className={css.tokenStatus}>
        {status?.exists ? (
          <>
            <span className={css.statusBadge}><i className={css.statusDotSmall} />已启用</span>
            <span className={css.tokenDate}>{status.created_at ? formatDate(status.created_at) : '-'}</span>
            <span className={css.lastUsed}>{status.last_used_at ? `最近使用 ${formatDate(status.last_used_at)}` : '从未使用'}</span>
          </>
        ) : (
          <span className={css.statusBadgeMuted}>未生成</span>
        )}
      </div>
      <div className={css.tokenAction}>
        <Button variant="secondary" onClick={() => status?.exists ? setConfirmOpen(true) : onReset(type)}>
          {status?.exists ? '重置 Token' : '生成 Token'}
        </Button>
      </div>

      {/* 重置 Token 确认弹窗 */}
      <DialogWrap
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`重置 ${title}`}
        description="重置后旧 Token 立即失效，相关客户端需要更新配置。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => { onReset(type); setConfirmOpen(false) }}
            >
              确认重置
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          确定要重置该 Token 吗？此操作无法撤销。
        </p>
      </DialogWrap>

      {/* 新生成的 Token 展示弹窗 */}
      <DialogWrap
        open={showOpen}
        onOpenChange={setShowOpen}
        title="新的 Token"
        description="请立即复制保存，关闭后不再显示。"
        footer={
          <Button variant="secondary" onClick={() => setShowOpen(false)}>
            关闭
          </Button>
        }
      >
        {newToken ? (
          <Field label="Token">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input readOnly value={newToken} />
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(newToken)}
              >
                复制
              </Button>
            </div>
          </Field>
        ) : null}
        {/* 当 newToken 出现时自动打开 */}
        <TokenAutoOpen token={newToken} onOpen={setShowOpen} />
      </DialogWrap>
    </article>
  )
}

// 监视 token 变化，首次出现时自动打开
function TokenAutoOpen({
  token,
  onOpen,
}: {
  token?: string
  onOpen: (v: boolean) => void
}) {
  useEffect(() => {
    if (token) onOpen(true)
  }, [token, onOpen])
  return null
}

// --- 偏好设置（占位）---

function PreferencesSection() {
  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>偏好设置</h2>
        <p className={css.sectionHint}>个性化设置（语言、主题、列表密度等）。即将开放。</p>
      </div>
      <div className={css.sectionBody}>
        <span className={css.kvLabel}>暂无可配置项。</span>
      </div>
    </section>
  )
}

// --- 统计（原 AdminOverview 内容精简：4 卡 + 存储源/用户概览 + 系统状态 + 最近审计）---

function StatsSection() {
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: fetchAdminOverview,
    refetchInterval: 30_000,
  })
  const o = overview.data
  const sys: OverviewSystem | undefined = o?.system

  return (
    <>
      <div className={css.statRow}>
        <StatCard
          label="存储源"
          value={o?.source_count ?? '—'}
          iconBg={vars.color.tileBlueBg}
          iconFg={vars.color.tileBlueFg}
        >
          <IconServer size={22} />
        </StatCard>
        <StatCard
          label="用户"
          value={o?.user_count ?? '—'}
          iconBg={vars.color.tileGreenBg}
          iconFg={vars.color.tileGreenFg}
        >
          <IconUser size={22} />
        </StatCard>
        <StatCard
          label="公开挂载"
          value={o?.public_mount_count ?? '—'}
          iconBg={vars.color.tileAmberBg}
          iconFg={vars.color.tileAmberFg}
        >
          <IconGlobe size={22} />
        </StatCard>
        <StatCard
          label="匿名图床"
          value={o?.anonymous_image_bed_on ? '已开启' : '未开启'}
          valueIsText
          iconBg={vars.color.tilePurpleBg}
          iconFg={vars.color.tilePurpleFg}
        >
          <IconImage size={22} />
        </StatCard>
      </div>

      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>系统状态</h2>
        </div>
        <div className={css.sectionBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>运行版本</span>
            <span className={css.kvValue}>{sys?.version ?? '—'}</span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>数据目录</span>
            <span className={css.kvValue}>{sys?.data_dir ?? '—'}</span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>主服务端口</span>
            <span className={css.kvValue}>{portOf(sys?.http_addr) ?? '—'}</span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>S3 状态</span>
            <span className={css.kvValue}>
              <span className={css.statusDot} style={{ background: o?.system.s3_enabled ? vars.color.success : vars.color.textSecondary }} />
              {sys?.s3_status ?? '—'}
            </span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>WebDAV 状态</span>
            <span className={css.kvValue}>
              <span className={css.statusDot} style={{ background: vars.color.success }} />
              {sys?.webdav_status ?? '—'}
            </span>
          </div>
        </div>
      </section>

      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>存储源概览</h2>
          <p className={css.sectionHint}>
            共 {o?.sources.length ?? 0} 个存储源，详细配置请见"存储源"。
          </p>
        </div>
        <div className={css.sectionBody} style={{ padding: 0, overflowX: 'auto' }}>
          <table className={css.compactTable}>
            <thead>
              <tr>
                <th className={css.compactTh}>名称</th>
                <th className={css.compactTh}>Source ID</th>
                <th className={css.compactTh}>真实路径</th>
                <th className={css.compactTh}>公开</th>
                <th className={css.compactTh}>状态</th>
              </tr>
            </thead>
            <tbody>
              {o?.sources.length === 0 && (
                <tr>
                  <td colSpan={5} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                    还没有存储源。
                  </td>
                </tr>
              )}
              {o?.sources.map((s) => (
                <tr key={s.source_id} className={css.compactTr}>
                  <td className={css.compactTd} style={{ fontWeight: 500 }}>{s.name}</td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary, fontFamily: vars.font.mono }}>
                    {s.source_id}
                  </td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary, fontFamily: vars.font.mono }}>
                    {s.root_path}
                  </td>
                  <td className={css.compactTd}>
                    {s.public_mount_path ? <span style={{ fontFamily: vars.font.mono }}>{s.public_mount_path}</span> : '—'}
                  </td>
                  <td className={css.compactTd}>
                    <Badge color={s.is_disabled ? 'gray' : 'green'}>
                      {s.is_disabled ? '已禁用' : '正常'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function portOf(addr?: string): string | undefined {
  if (!addr) return undefined
  const i = addr.lastIndexOf(':')
  return i >= 0 ? addr.slice(i + 1) : addr
}

function StatCard({
  label,
  value,
  valueIsText,
  iconBg,
  iconFg,
  children,
}: {
  label: string
  value: number | string
  valueIsText?: boolean
  iconBg: string
  iconFg: string
  children: React.ReactNode
}) {
  return (
    <div className={css.statCard}>
      <span className={css.statIcon} style={{ background: iconBg, color: iconFg }}>
        {children}
      </span>
      <div className={css.statBody}>
        <span className={css.statLabel}>{label}</span>
        {valueIsText ? (
          <span className={css.statValueText}>{value}</span>
        ) : (
          <span className={css.statValue}>
            {value}
            <span className={css.statTrend} aria-hidden="true">
              <IconArrowUp size={14} />
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// --- 存储源（原 AdminSources）---

function SourcesSection() {
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminSource | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-sources'] })

  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      adminSetSourceDisabled(id, disabled),
    onSuccess: refresh, onError: (err) => alert(err instanceof ApiRequestError ? err.message : '操作失败'),
  })
  const deleteMut = useMutation({
    mutationFn: adminDeleteSource, onSuccess: () => { setDeleting(null); refresh() },
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  return (
    <>
      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>存储源</h2>
          <p className={css.sectionHint}>
            共 {sources.data?.length ?? 0} 个 · 路径创建后不可修改。
          </p>
        </div>
        <div className={css.sectionBody}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus size={14} /> 新建存储源
            </Button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={css.compactTable}>
            <thead>
              <tr>
                <th className={css.compactTh}>source_id</th>
                <th className={css.compactTh}>名称</th>
                <th className={css.compactTh}>路径</th>
                <th className={css.compactTh}>状态</th>
                <th className={css.compactTh}>公开</th>
                <th className={css.compactTh}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.data?.map((s) => (
                <tr key={s.source_id} className={css.compactTr}>
                  <td className={css.compactTd} style={{ fontFamily: vars.font.mono }}>{s.source_id}</td>
                  <td className={css.compactTd} style={{ fontWeight: 500 }}>{s.name}</td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary, fontFamily: vars.font.mono }}>
                    {s.root_path}
                  </td>
                  <td className={css.compactTd}>
                    <Badge color={s.is_disabled ? 'gray' : 'green'}>
                      {s.is_disabled ? '已禁用' : '正常'}
                    </Badge>
                  </td>
                  <td className={css.compactTd}>
                    {s.public_read_enabled ? <Badge color="green">公开</Badge> : '—'}
                  </td>
                  <td className={css.compactTd}>
                    <div className={css.formRow}>
                      <Button variant="ghost" onClick={() => setEditId(s.source_id)}>
                        配置
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => disableMut.mutate({ id: s.source_id, disabled: !s.is_disabled })}
                      >
                        {s.is_disabled ? '启用' : '禁用'}
                      </Button>
                      <Button variant="danger" onClick={() => setDeleting(s)}>
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.isSuccess && sources.data.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>
              还没有存储源
            </div>
          )}
        </div>
      </section>

      {/* 新建存储源 弹窗 */}
      <CreateSourceDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 编辑存储源 弹窗 */}
      {editId && (
        <EditSourceDialog
          sourceId={editId}
          onClose={() => setEditId(null)}
        />
      )}

      {/* 删除确认 弹窗 */}
      <DialogWrap
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title="删除存储源"
        description={`确定要删除「${deleting?.name ?? ''}」吗？`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => deleting && deleteMut.mutate(deleting.source_id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          此操作只会从 OmniStore 中移除该存储源及其授权关系，不会删除磁盘上的真实文件。该操作不可撤销。
        </p>
      </DialogWrap>
    </>
  )
}

// --- 新建存储源 弹窗 ---

function CreateSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [sourceId, setSourceId] = useState('')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: adminCreateSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (!open) { setSourceId(''); setName(''); setRootPath(''); setErr('') }
  }, [open])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(sourceId)) {
      setErr('source_id 必须以小写字母或数字开头，仅包含小写字母、数字、短横线（最长 41）')
      return
    }
    if (!rootPath.startsWith('/')) {
      setErr('路径必须是绝对路径（以 / 开头）')
      return
    }
    mutation.mutate(
      { source_id: sourceId, name: name || sourceId, description: '', root_path: rootPath },
      { onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '创建失败') },
    )
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="新建存储源"
      description="路径创建后不可修改；不允许系统目录、数据目录或重叠挂载。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={onSubmit}
            disabled={mutation.isPending || !sourceId || !rootPath}
          >
            {mutation.isPending ? '创建中…' : '创建'}
          </Button>
        </>
      }
    >
      <Field label="source_id" required hint="小写字母数字短横线，创建后不可改">
        <Input
          autoFocus
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder="例如：photos"
        />
      </Field>
      <Field label="名称" hint="留空则使用 source_id">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="显示在列表里的名字"
        />
      </Field>
      <Field
        label="真实目录绝对路径"
        required
        error={err}
        hint="Docker 内为容器路径，例如 /data/photos"
      >
        <Input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/var/data/xxx"
        />
      </Field>
    </DialogWrap>
  )
}

// --- 编辑存储源 弹窗（WebDAV/图床/公开访问 + 排除规则 + 用户权限）---

function EditSourceDialog({
  sourceId,
  onClose,
}: {
  sourceId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['admin-source', sourceId], queryFn: () => adminGetSource(sourceId) })
  const perms = useQuery({ queryKey: ['admin-perms', sourceId], queryFn: () => adminListPermissions(sourceId) })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })

  const [mountPath, setMountPath] = useState<string | null>(null)
  const [patterns, setPatterns] = useState<string | null>(null)
  const [publicOn, setPublicOn] = useState<boolean | null>(null)
  const [webdavOn, setWebdavOn] = useState<boolean | null>(null)
  const [imageBedOn, setImageBedOn] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [permUserId, setPermUserId] = useState('')
  const [permLevel, setPermLevel] = useState<'read_only' | 'read_write'>('read_only')

  // 打开弹窗时，把当前值同步到本地 state
  useEffect(() => {
    if (detail.isSuccess) {
      setMountPath(detail.data.source.public_mount_path ?? '')
      setPatterns(detail.data.exclude_patterns.join('\n'))
      setPublicOn(detail.data.source.public_read_enabled)
      setWebdavOn(detail.data.source.webdav_enabled)
      setImageBedOn(detail.data.source.image_bed_enabled)
    }
  }, [detail.isSuccess, detail.data])

  const updateMut = useMutation({
    mutationFn: (input: Parameters<typeof adminUpdateSource>[1]) => adminUpdateSource(sourceId, input),
    onSuccess: () => { setMsg('已保存'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  const patternsMut = useMutation({
    mutationFn: (list: string[]) => adminSetExcludePatterns(sourceId, list),
    onSuccess: () => { setMsg('排除规则已保存'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  const setPermMut = useMutation({
    mutationFn: ({ userId, level }: { userId: number; level: 'read_only' | 'read_write' }) =>
      adminSetPermission(sourceId, userId, level),
    onSuccess: () => { setMsg('权限已更新'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '操作失败'),
  })
  const removePermMut = useMutation({
    mutationFn: (userId: number) => adminRemovePermission(sourceId, userId),
    onSuccess: () => { setMsg('已取消权限'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '操作失败'),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-source', sourceId] })
    queryClient.invalidateQueries({ queryKey: ['admin-perms', sourceId] })
    queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
  }

  if (!detail.isSuccess) return null
  const src: AdminSource = detail.data.source
  const mountValue = mountPath ?? src.public_mount_path ?? ''
  const patternsValue = patterns ?? detail.data.exclude_patterns.join('\n')

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title={`配置：${src.name}`}
      description={`source_id: ${src.source_id} · 路径: ${src.root_path}`}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>关闭</Button>
      }
    >
      <Field label="功能开关" hint="修改后即时保存">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={webdavOn ?? src.webdav_enabled}
              onChange={(e) => {
                setWebdavOn(e.target.checked)
                updateMut.mutate({ webdav_enabled: e.target.checked })
              }}
            />
            启用 WebDAV（该存储源可作为 WebDAV 挂载点）
          </label>
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={imageBedOn ?? src.image_bed_enabled}
              onChange={(e) => {
                setImageBedOn(e.target.checked)
                updateMut.mutate({ image_bed_enabled: e.target.checked })
              }}
            />
            启用图床（该存储源可作为图床后端）
          </label>
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={publicOn ?? src.public_read_enabled}
              onChange={(e) => {
                if (e.target.checked && !mountValue) {
                  setMsg('请先填写公开挂载路径')
                  return
                }
                setPublicOn(e.target.checked)
                updateMut.mutate({
                  public_read_enabled: e.target.checked,
                  public_mount_path: mountValue,
                })
              }}
            />
            公开访问（无需登录即可按挂载路径只读浏览）
          </label>
        </div>
      </Field>

      <Field
        label="公开挂载路径"
        hint="如 /photos，修改后旧链接失效"
        required={publicOn ?? src.public_read_enabled}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={mountValue}
            onChange={(e) => setMountPath(e.target.value)}
            placeholder="/photos"
          />
          <Button
            variant="secondary"
            onClick={() =>
              updateMut.mutate({
                public_mount_path: mountValue,
                public_read_enabled: publicOn ?? src.public_read_enabled,
              })
            }
          >
            保存路径
          </Button>
        </div>
      </Field>

      <Field
        label="排除规则（每行一条 glob）"
        hint="匹配的文件不会出现在文件列表中，例如 *.tmp 或 .git/*"
      >
        <textarea
          className={fieldCss.textarea}
          value={patternsValue}
          onChange={(e) => setPatterns(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={() => patternsMut.mutate(patternsValue.split('\n'))}
          >
            保存排除规则
          </Button>
        </div>
      </Field>

      <Field
        label="用户权限"
        hint="为用户分配该存储源的访问权限"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {perms.data?.length === 0 && (
            <span style={{ color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>
              还没有授权用户。
            </span>
          )}
          {perms.data?.map((p) => (
            <div
              key={p.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '6px 0',
              }}
            >
              <span style={{ minWidth: 120, fontSize: vars.fontSize.sm }}>{p.username}</span>
              <Badge color={p.permission === 'read_write' ? 'blue' : 'gray'}>
                {p.permission === 'read_write' ? '读写' : '只读'}
              </Badge>
              <Button
                variant="ghost"
                onClick={() =>
                  setPermMut.mutate({
                    userId: p.user_id,
                    level: p.permission === 'read_write' ? 'read_only' : 'read_write',
                  })
                }
              >
                切换
              </Button>
              <Button variant="danger" onClick={() => removePermMut.mutate(p.user_id)}>
                取消权限
              </Button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Select
              value={permUserId}
              onValueChange={setPermUserId}
              options={users.data
                ?.filter((u) => !perms.data?.some((p) => p.user_id === u.id))
                .map((u) => ({ value: String(u.id), label: u.username })) ?? []}
              placeholder="选择用户…"
              ariaLabel="选择要授权的用户"
              width="wide"
            />
            <Select
              value={permLevel}
              onValueChange={(nextValue) => setPermLevel(nextValue as 'read_only' | 'read_write')}
              options={[
                { value: 'read_only', label: '只读' },
                { value: 'read_write', label: '读写' },
              ]}
              ariaLabel="权限级别"
              width="content"
            />
            <Button
              variant="secondary"
              disabled={!permUserId}
              onClick={() => setPermMut.mutate({ userId: Number(permUserId), level: permLevel })}
            >
              分配权限
            </Button>
          </div>
        </div>
      </Field>

      {msg && (
        <div
          style={{
            fontSize: vars.fontSize.sm,
            color: vars.color.textSecondary,
            textAlign: 'right',
          }}
        >
          {msg}
        </div>
      )}
    </DialogWrap>
  )
}

// --- 用户（原 AdminUsers）---

function UsersSection() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<User | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) => adminSetUserDisabled(id, disabled),
    onSuccess: refresh, onError: (err) => alert(err instanceof ApiRequestError ? err.message : '操作失败'),
  })
  const deleteMut = useMutation({
    mutationFn: adminDeleteUser, onSuccess: () => { setDeleting(null); refresh() },
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  return (
    <>
      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>用户</h2>
          <p className={css.sectionHint}>共 {users.data?.length ?? 0} 个 · 用户首次登录后可自行修改密码。</p>
        </div>
        <div className={css.sectionBody}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setCreateOpen(true)}>
              <IconUserPlus size={14} /> 创建用户
            </Button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={css.compactTable}>
            <thead>
              <tr>
                <th className={css.compactTh}>用户名</th>
                <th className={css.compactTh}>显示名</th>
                <th className={css.compactTh}>角色</th>
                <th className={css.compactTh}>状态</th>
                <th className={css.compactTh}>创建时间</th>
                <th className={css.compactTh}>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className={css.compactTr}>
                  <td className={css.compactTd} style={{ fontWeight: 500 }}>{u.username}</td>
                  <td className={css.compactTd}>{u.display_name}</td>
                  <td className={css.compactTd}>
                    <Badge color={u.role === 'super_admin' ? 'blue' : 'gray'}>
                      {u.role === 'super_admin' ? '管理员' : '用户'}
                    </Badge>
                  </td>
                  <td className={css.compactTd}>
                    <Badge color={u.is_disabled ? 'gray' : 'green'}>
                      {u.is_disabled ? '已禁用' : '正常'}
                    </Badge>
                  </td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td className={css.compactTd}>
                    {u.id !== me.data?.id ? (
                      <div className={css.formRow}>
                        <Button
                          variant="ghost"
                          onClick={() => disableMut.mutate({ id: u.id, disabled: !u.is_disabled })}
                        >
                          {u.is_disabled ? '启用' : '禁用'}
                        </Button>
                        <Button variant="danger" onClick={() => setDeleting(u)}>
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    ) : (
                      <span className={css.kvLabel}>（当前用户）</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.isSuccess && users.data.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>
              还没有用户
            </div>
          )}
        </div>
      </section>

      {/* 创建用户 弹窗 */}
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 删除确认 弹窗 */}
      <DialogWrap
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title="删除用户"
        description={`确定要删除用户「${deleting?.username ?? ''}」吗？`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          该用户的 Token、授权关系与会话都会被清除。该操作不可撤销。
        </p>
      </DialogWrap>
    </>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: adminCreateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (!open) { setUsername(''); setDisplayName(''); setPassword(''); setRole('user'); setErr('') }
  }, [open])

  function onSubmit() {
    setErr('')
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
      setErr('用户名仅允许字母、数字、下划线、短横线，长度 2-32')
      return
    }
    if (password.length < 8) {
      setErr('密码至少 8 位')
      return
    }
    mutation.mutate(
      { username, display_name: displayName || username, password, role },
      { onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '创建失败') },
    )
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="创建用户"
      description="用户首次登录后可自行修改密码。"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={onSubmit}
            disabled={mutation.isPending || !username || !password}
          >
            {mutation.isPending ? '创建中…' : '创建'}
          </Button>
        </>
      }
    >
      <Field label="用户名" required hint="2-32 位字母数字下划线短横线">
        <Input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field label="显示名" hint="留空则使用用户名">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      <Field
        label="密码"
        required
        error={err}
        hint="至少 8 位，建议字母数字符号组合"
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="角色" required>
        <Select
          value={role}
          onValueChange={setRole}
          options={[
            { value: 'user', label: '普通用户' },
            { value: 'super_admin', label: '超级管理员' },
          ]}
          ariaLabel="用户角色"
          required
        />
      </Field>
    </DialogWrap>
  )
}

// --- 审计日志（原 AdminAudit）---

function AuditSection() {
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(() => ({ ...emptyAuditFilters }))
  const [filters, setFilters] = useState<AuditFilters>(() => ({ ...emptyAuditFilters }))
  const [page, setPage] = useState(1)

  const logs = useQuery({
    queryKey: [
      'admin-audit',
      page,
      filters.actorType,
      filters.entryType,
      filters.status,
      filters.searchText,
    ],
    queryFn: () => adminFetchAuditLogs({
      page,
      page_size: auditPageSize,
      actor_type: filters.actorType === 'all' ? undefined : filters.actorType as 'user' | 'anonymous' | 'system',
      entry_type: filters.entryType === 'all' ? undefined : filters.entryType as 'web' | 'webdav' | 'image_bed' | 'anonymous_image_bed' | 'admin' | 'cli',
      status: filters.status === 'all' ? undefined : filters.status as 'success' | 'failed',
      q: filters.searchText || undefined,
    }),
  })

  const total = logs.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / auditPageSize))

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setFilters({ ...draftFilters, searchText: draftFilters.searchText.trim() })
  }

  function resetFilters() {
    setDraftFilters({ ...emptyAuditFilters })
    setFilters({ ...emptyAuditFilters })
    setPage(1)
  }

  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>审计日志</h2>
        <p className={css.sectionHint}>按主体、入口、结果或关键字筛选实例上的关键操作。</p>
      </div>
      <form className={css.auditFilters} onSubmit={applyFilters}>
        <Field label="主体">
          <Select
            value={draftFilters.actorType}
            onValueChange={(value) => setDraftFilters((current) => ({ ...current, actorType: value }))}
            options={auditActorOptions}
            ariaLabel="筛选审计主体"
            size="compact"
          />
        </Field>
        <Field label="入口">
          <Select
            value={draftFilters.entryType}
            onValueChange={(value) => setDraftFilters((current) => ({ ...current, entryType: value }))}
            options={auditEntryOptions}
            ariaLabel="筛选审计入口"
            size="compact"
          />
        </Field>
        <Field label="结果">
          <Select
            value={draftFilters.status}
            onValueChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
            options={auditStatusOptions}
            ariaLabel="筛选审计结果"
            size="compact"
          />
        </Field>
        <Field label="关键字">
          <Input
            value={draftFilters.searchText}
            onChange={(event) => setDraftFilters((current) => ({ ...current, searchText: event.target.value }))}
            placeholder="动作、路径、存储源、IP 或错误码"
            maxLength={128}
          />
        </Field>
        <div className={css.auditFilterActions}>
          <Button type="submit">查询</Button>
          <Button type="button" variant="secondary" onClick={resetFilters}>重置</Button>
        </div>
      </form>
      <div className={css.auditTableWrap} aria-busy={logs.isFetching}>
        <table className={css.compactTable}>
          <thead>
            <tr>
              <th className={css.compactTh}>时间</th>
              <th className={css.compactTh}>主体</th>
              <th className={css.compactTh}>入口</th>
              <th className={css.compactTh}>动作</th>
              <th className={css.compactTh}>存储源</th>
              <th className={css.compactTh}>路径</th>
              <th className={css.compactTh}>IP</th>
              <th className={css.compactTh}>结果</th>
            </tr>
          </thead>
          <tbody>
            {logs.data?.items.map((log) => (
              <tr key={log.id} className={css.compactTr}>
                <td className={css.compactTd} style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                <td className={css.compactTd}>{log.actor_type}{log.actor_user_id ? `#${log.actor_user_id}` : ''}</td>
                <td className={css.compactTd}>{log.entry_type}</td>
                <td className={css.compactTd}>{log.action}</td>
                <td className={css.compactTd} style={{ fontFamily: vars.font.mono, color: vars.color.textSecondary }}>
                  {log.source_id ?? '—'}
                </td>
                <td className={css.compactTd}>
                  {log.relative_path ?? '—'}
                  {log.target_relative_path ? ` → ${log.target_relative_path}` : ''}
                </td>
                <td className={css.compactTd} style={{ fontFamily: vars.font.mono, color: vars.color.textSecondary }}>
                  {log.ip_address ?? '—'}
                </td>
                <td className={css.compactTd}>
                  {log.status === 'success' ? (
                    <Badge color="green">成功</Badge>
                  ) : (
                    <Badge color="red">失败{log.error_code ? ` (${log.error_code})` : ''}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.isPending && (
          <div className={css.auditMessage}>正在加载审计日志…</div>
        )}
        {logs.isSuccess && logs.data.items.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>
            没有符合条件的日志
          </div>
        )}
        {logs.isError && (
          <div style={{ padding: 16, textAlign: 'center', color: vars.color.danger, fontSize: vars.fontSize.sm }}>
            加载失败
          </div>
        )}
      </div>
      <div className={css.auditPagination}>
        <span aria-live="polite">
          共 {total} 条，第 {Math.min(page, totalPages)} / {totalPages} 页
        </span>
        <div className={css.auditPaginationActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || logs.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages || logs.isFetching}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            下一页
          </Button>
        </div>
      </div>
    </section>
  )
}

// --- 匿名图床（原 AdminSettings 的匿名图床 + 运行信息）---

function ImageBedSection() {
  const settings = useQuery({ queryKey: ['admin-anon-settings'], queryFn: adminGetAnonymousSettings })
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ status: string; version: string }>('/api/v1/health'),
  })
  const anonStatus = useQuery({ queryKey: ['anon-status'], queryFn: () => apiFetch<{ max_file_size_mb: number; enabled: boolean }>('/api/v1/image-bed/anonymous-status') })

  const [editOpen, setEditOpen] = useState(false)
  const [msg, setMsg] = useState('')

  if (!settings.isSuccess) {
    return (
      <section className={css.section}>
        <div className={css.sectionBody}>
          <span className={css.kvLabel}>加载中…</span>
        </div>
      </section>
    )
  }

  const imageBedSources = sources.data?.filter((s) => s.image_bed_enabled && !s.is_disabled) ?? []

  return (
    <>
      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>匿名公共图床</h2>
          <p className={css.sectionHint}>
            默认关闭。开启后任何人无需登录即可通过 /upload 上传图片
            （单张最大 {anonStatus.data?.max_file_size_mb ?? '-'}MB，按 IP 限流）。
          </p>
        </div>
        <div className={css.sectionBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>当前状态</span>
            <span className={css.kvValue}>
              {settings.data.enabled ? (
                <>
                  <Badge color="green">已开启</Badge>
                  <span style={{ marginLeft: 8, color: vars.color.textSecondary }}>
                    目标存储源：{settings.data.source_id}
                  </span>
                </>
              ) : (
                <Badge color="gray">未开启</Badge>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditOpen(true)}>
              {settings.data.enabled ? '调整' : '开启'}
            </Button>
          </div>
          {msg && <span className={css.kvLabel}>{msg}</span>}
        </div>
      </section>

      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>运行信息</h2>
        </div>
        <div className={css.sectionBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>版本</span>
            <span className={css.kvValue}>{health.data?.version ?? '-'}</span>
          </div>
          <span className={css.kvLabel}>
            基础设施配置（监听地址、public_url、上传限制等）由 config.yaml 和 OMNISTORE_* 环境变量管理，修改后需重启服务。
          </span>
        </div>
      </section>

      {/* 匿名图床配置 弹窗 */}
      <AnonymousImageBedDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setMsg('') }}
        enabled={settings.data.enabled}
        sourceId={settings.data.source_id}
        imageBedSources={imageBedSources}
      />
    </>
  )
}

function AnonymousImageBedDialog({
  open,
  onOpenChange,
  enabled,
  sourceId,
  imageBedSources,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  enabled: boolean
  sourceId: string
  imageBedSources: { source_id: string; name: string }[]
}) {
  const queryClient = useQueryClient()
  const [pickSource, setPickSource] = useState(sourceId)
  const [turnOn, setTurnOn] = useState(enabled)
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: adminSetAnonymousSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-anon-settings'] })
      onOpenChange(false)
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '保存失败'),
  })

  useEffect(() => {
    if (open) {
      setPickSource(sourceId)
      setTurnOn(enabled)
      setErr('')
    }
  }, [open, sourceId, enabled])

  function onSubmit() {
    if (turnOn && !pickSource) {
      setErr('请选择目标存储源')
      return
    }
    mutation.mutate({ enabled: turnOn, source_id: pickSource })
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title={enabled ? '调整匿名图床' : '开启匿名图床'}
      description="任何人通过 /upload 即可上传（按 IP 限流）。"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? '保存中…' : enabled ? '保存' : '开启'}
          </Button>
        </>
      }
    >
      <Field label="启用" required>
        <label className={fieldCss.checkboxRow}>
          <input
            type="checkbox"
            className={fieldCss.checkbox}
            checked={turnOn}
            onChange={(e) => setTurnOn(e.target.checked)}
          />
          允许匿名访问 /upload
        </label>
      </Field>
      <Field
        label="目标存储源"
        required={turnOn}
        hint={turnOn ? '需为"启用图床"且未禁用的存储源' : '保存时将一同记录'}
        error={err}
      >
        <Select
          value={pickSource}
          onValueChange={setPickSource}
          options={imageBedSources.map((source) => ({
            value: source.source_id,
            label: `${source.name}（${source.source_id}）`,
          }))}
          placeholder="选择存储源…"
          ariaLabel="匿名图床目标存储源"
          required={turnOn}
        />
      </Field>
    </DialogWrap>
  )
}

// --- 页脚：版本号 + git commit（仿 docs/settings-layout.png 左下角）---

function VersionFooter() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ version: string; commit?: string; build_time?: string }>('/api/v1/health'),
  })
  const version = health.data?.version ?? '...'
  const commit = (health.data as { commit?: string })?.commit
  const buildTime = (health.data as { build_time?: string })?.build_time
  const lines = useMemo(
    () => [
      `版本: ${version}`,
      commit ? `Commit: ${commit}` : null,
      buildTime ? `Build:  ${buildTime}` : null,
    ].filter(Boolean) as string[],
    [version, commit, buildTime],
  )
  return <div className={css.settingsFooter}>{lines.join('\n')}</div>
}
