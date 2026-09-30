import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiRequestError } from '../../api/client'
import {
  adminCreateSource,
  adminCreateUser,
  adminCreatePolicy,
  adminDeletePolicy,
  adminDeleteSource,
  adminDeleteUser,
  adminExportSystemConfig,
  adminFetchAuditLogs,
  adminGetAnonymousSettings,
  adminGetBranding,
  adminGetSource,
  adminGetImageBedRetention,
  adminListCapabilities,
  adminListPolicies,
  adminListSources,
  adminListUsers,
  adminPreflightSource,
  adminReconcileSource,
  adminRevokeUserCredentials,
  adminSetAnonymousSettings,
  adminSetBranding,
  adminSetImageBedRetention,
  adminSetSourceDisabled,
  adminConfigureStaticAssets,
  adminGetStaticConfig,
  adminPreflightStaticAssets,
  adminRebindStaticAssets,
  adminUpdateStaticAssets,
  type StaticAssetConfig,
  type StaticAssetPreflight,
  adminSetUserDisabled,
  adminSetUserQuota,
  adminUpdateSource,
  adminUpdatePolicy,
  changePassword,
  fetchAdminOverview,
  updateProfile,
  type AdminSource,
  type AdminUser,
  type AccessPermission,
  type AccessPolicy,
  type AccessPolicyInput,
  type AccessPolicyPathRule,
  type OverviewSystem,
  type SourcePreflight,
} from '../../api/admin'
import { fetchMe, type User } from '../../api/auth'
import {
  createImageBedToken,
  deleteImageBedToken,
  fetchImageBedTokens,
  fetchTokenStatus,
  resetToken,
  type ImageBedToken,
} from '../../api/imagebed'
import {
  createS3Credential,
  deleteS3Credential,
  fetchS3Credentials,
  setS3CredentialDisabled,
  type S3Credential,
} from '../../api/s3'
import { fetchMySources } from '../../api/sources'
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
  IconChevronRight,
  IconCloud,
  IconDownload,
  IconGlobe,
  IconImage,
  IconInfo,
  IconLink,
  IconPlus,
  IconServer,
  IconSettings,
  IconShield,
  IconTrash,
  IconUser,
  IconUserPlus,
} from '../../components/ui/Icon'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import { vars } from '../../styles/theme.css'
import { formatBytes, formatDate } from '../../utils/format'
import { auditActionLabel, auditActorLabel, auditEntryLabel } from '../../utils/audit'
import * as css from './AdminOverview.css'

// 系统设置页（docs/settings-layout.png）：左侧分组的子导航 + 右侧多 section。
// 把原 /app/admin、/app/admin/sources、/app/admin/users、/app/admin/audit-logs、
// /app/admin/settings 与 /app/settings 合并到本页。
type SectionKey =
  | 'profile'
  | 'preferences'
  | 'stats'
  | 'sources'
  | 'policies'
  | 'users'
  | 'audit'
  | 'backup'
  | 'image-bed'
  | 'static-assets'
  | 'branding'

const baseNav: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: '我的', icon: <IconUser size={15} /> },
  { key: 'preferences', label: '偏好设置', icon: <IconSettings size={15} /> },
]

const auditPageSize = 10

const credentialViews = [
  {
    key: 'webdav',
    label: 'WebDAV',
    meta: '桌面挂载',
    description: '使用系统文件管理器或支持 WebDAV 的客户端挂载文件。',
    icon: <IconLink size={18} />,
  },
  {
    key: 'image-api',
    label: '图床 API',
    meta: '上传客户端',
    description: '为 PicGo 或第三方客户端签发可单独撤销的 Token。',
    icon: <IconImage size={18} />,
  },
  {
    key: 's3',
    label: 'S3',
    meta: 'CLI 与 SDK',
    description: '为 AWS CLI、rclone 或 SDK 创建独立访问凭据。',
    icon: <IconCloud size={18} />,
  },
] as const

type CredentialView = typeof credentialViews[number]['key']

function quotaGiBInputValue(bytes: number): string {
  if (bytes <= 0) return '0'
  return String(Number((bytes / (1024 ** 3)).toFixed(6)))
}

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
  { value: 's3', label: 'S3' },
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
  { key: 'policies', label: '访问策略', icon: <IconShield size={15} /> },
  { key: 'users', label: '用户', icon: <IconUser size={15} /> },
  { key: 'audit', label: '审计日志', icon: <IconActivity size={15} /> },
  { key: 'backup', label: '配置导出', icon: <IconDownload size={15} /> },
  { key: 'branding', label: '品牌信息', icon: <IconGlobe size={15} /> },
  { key: 'image-bed', label: '匿名图床', icon: <IconImage size={15} /> },
  { key: 'static-assets', label: '静态资源', icon: <IconGlobe size={15} /> },
]

export function AdminOverviewPage() {
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const isAdmin = me.data?.role === 'super_admin'
  const availableNav = isAdmin ? baseNav.concat(adminNav) : baseNav
  const settingsNavRef = useRef<HTMLElement>(null)
  const section: SectionKey = (availableNav.find((n) => n.key === search.section)?.key ??
    'profile') as SectionKey

  useEffect(() => {
    settingsNavRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [section])

  function setSection(k: SectionKey) {
    navigate({ to: '/app/admin', search: { section: k } })
  }

  return (
    <AdminLayout>
      <AdminPageHeader title={isAdmin ? '系统设置' : '账号设置'} />

      <div className={css.settingsLayout}>
        {/* 左侧分组的子导航 */}
        <nav ref={settingsNavRef} className={css.settingsSide} aria-label="设置分组">
          <div className={css.settingsGroup}>
            <span className={css.settingsGroupTitle}>基础</span>
            {baseNav.map((item) => (
              <button
                type="button"
                key={item.key}
                className={section === item.key ? css.settingsNavLinkActive : css.settingsNavLink}
                onClick={() => setSection(item.key)}
                aria-current={section === item.key ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          {isAdmin ? (
            <div className={css.settingsGroup}>
              <span className={css.settingsGroupTitle}>管理</span>
              {adminNav.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={section === item.key ? css.settingsNavLinkActive : css.settingsNavLink}
                  onClick={() => setSection(item.key)}
                  aria-current={section === item.key ? 'page' : undefined}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </nav>

        {/* 右侧内容 */}
        <div className={css.settingsContent}>
          {section === 'profile' && <ProfileSection />}
          {section === 'preferences' && <PreferencesSection />}
          {section === 'stats' && <StatsSection />}
          {section === 'sources' && <SourcesSection />}
          {section === 'policies' && <PoliciesSection />}
          {section === 'users' && <UsersSection />}
          {section === 'audit' && <AuditSection />}
          {section === 'backup' && <BackupSection />}
          {section === 'image-bed' && <ImageBedSection />}
          {section === 'static-assets' && <StaticAssetsSection />}
          {section === 'branding' && <BrandingSection />}
        </div>
      </div>

      <VersionFooter />
    </AdminLayout>
  )
}

function HorizontalDataRegion({
  name,
  labelledBy,
  busy,
  children,
}: {
  name: string
  labelledBy: string
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={css.dataScrollFrame}>
      <div
        className={css.dataScroll}
        role="region"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-label={name}
        aria-busy={busy}
      >
        {children}
      </div>
    </div>
  )
}

// --- 我的（原 /app/settings：个人资料 + 修改密码 + WebDAV/图床 Token）---

function ProfileSection() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const tokens = useQuery({ queryKey: ['token-status'], queryFn: fetchTokenStatus })
  const s3Credentials = useQuery({ queryKey: ['s3-credentials'], queryFn: fetchS3Credentials })

  const [profileOpen, setProfileOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [newTokens, setNewTokens] = useState<Record<string, string>>({})
  const [credentialView, setCredentialView] = useState<CredentialView | null>(null)

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

  function dismissNewToken(type: 'webdav') {
    setNewTokens((prev) => ({ ...prev, [type]: '' }))
  }

  function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (displayName.trim()) profileMut.mutate(displayName.trim())
  }
  function onChangePassword(e: FormEvent) {
    e.preventDefault()
    pwdMut.mutate({ o: oldPwd, n: newPwd })
  }

  function credentialStatus(view: CredentialView) {
    if (view === 's3') {
      if (s3Credentials.isPending) return { label: '正在读取', active: false }
      if (s3Credentials.isError) return { label: '状态未知', active: false, error: true }
      const enabled = (s3Credentials.data ?? []).filter((item) => !item.is_disabled).length
      return enabled > 0
        ? { label: `已启用 ${enabled} 个`, active: true }
        : { label: '未生成', active: false }
    }

    if (tokens.isPending) return { label: '正在读取', active: false }
    if (tokens.isError) return { label: '状态未知', active: false, error: true }
    const status = view === 'webdav' ? tokens.data?.webdav : tokens.data?.image_bed
    return status?.exists
      ? { label: view === 'webdav' ? '已启用' : `已启用 ${status.count} 个`, active: true }
      : { label: '未生成', active: false }
  }

  function closeCredentialModal() {
    const previous = credentialView
    setCredentialView(null)
    requestAnimationFrame(() => {
      if (previous) document.getElementById(`credential-entry-${previous}`)?.focus()
    })
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
        description="修改后当前设备保持登录，其他设备的登录会话立即失效。"
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
          <p className={css.credentialsHint}>选择连接类型查看状态和管理凭据。Token 与 Secret 仅展示一次。</p>
        </header>
        <nav className={css.credentialOverview} aria-label="连接类型">
          {credentialViews.map((view) => {
            const status = credentialStatus(view.key)
            return (
              <button
                key={view.key}
                id={`credential-entry-${view.key}`}
                type="button"
                className={css.credentialOverviewItem}
                onClick={() => setCredentialView(view.key)}
                aria-label={`管理 ${view.label}`}
              >
                <span className={css.credentialOverviewIcon} aria-hidden="true">{view.icon}</span>
                <span className={css.credentialOverviewCopy}>
                  <span className={css.credentialOverviewTitleLine}>
                    <strong className={css.credentialOverviewTitle}>{view.label}</strong>
                    <small className={css.credentialOverviewMeta}>{view.meta}</small>
                  </span>
                  <span className={css.credentialOverviewDescription}>{view.description}</span>
                </span>
                <span
                  className={status.error
                    ? css.credentialStatusError
                    : status.active ? css.statusBadge : css.statusBadgeMuted}
                >
                  {status.active ? <i className={css.statusDotSmall} /> : null}
                  {status.label}
                </span>
                <IconChevronRight size={17} />
              </button>
            )
          })}
        </nav>
        <DialogWrap
          open={credentialView !== null}
          onOpenChange={(open) => { if (!open) closeCredentialModal() }}
          title={credentialViews.find((view) => view.key === credentialView)?.label ?? '管理连接'}
          description={credentialViews.find((view) => view.key === credentialView)?.description}
          wide
          footer={<Button variant="secondary" onClick={closeCredentialModal}>完成</Button>}
        >
          <div className={css.credentialModalContent}>
            {credentialView === 'webdav' ? (
              <TokenBlock
                type="webdav"
                hint="通过 /dav 挂载文件，使用登录名与此 Token 认证。"
                status={tokens.data?.webdav}
                newToken={newTokens.webdav}
                onReset={(t) => resetMut.mutate(t)}
                onDismiss={dismissNewToken}
                pending={tokens.isPending}
                error={tokens.isError}
                resetting={resetMut.isPending}
              />
            ) : null}
            {credentialView === 'image-api' ? <ImageBedTokenManager /> : null}
            {credentialView === 's3' ? <S3CredentialManager /> : null}
          </div>
        </DialogWrap>
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

function CredentialGroupHeader({
  hint,
  status,
  action,
}: {
  hint: string
  status: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <header className={css.credentialGroupHeader}>
      <div className={css.credentialGroupCopy}>
        <div className={css.credentialTitleLine}>{status}</div>
        <p className={css.credentialGroupHint}>{hint}</p>
      </div>
      <div className={css.credentialGroupAction}>{action}</div>
    </header>
  )
}

function TokenBlock({
  type,
  hint,
  status,
  newToken,
  onReset,
  onDismiss,
  pending,
  error,
  resetting,
}: {
  type: 'webdav'
  hint: string
  status?: { exists: boolean; created_at?: string | null; last_used_at?: string | null }
  newToken?: string
  onReset: (t: 'webdav') => void
  onDismiss: (t: 'webdav') => void
  pending: boolean
  error: boolean
  resetting: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showOpen, setShowOpen] = useState(false)
  const tokenInputId = useId()
  useEffect(() => {
    if (newToken) setShowOpen(true)
  }, [newToken])
  const closeTokenReveal = () => {
    setShowOpen(false)
    onDismiss(type)
  }
  return (
    <section className={css.credentialGroup} aria-label="WebDAV">
      <CredentialGroupHeader
        hint={hint}
        status={pending ? (
          <span className={css.statusBadgeMuted}>正在读取</span>
        ) : error ? (
          <span className={css.credentialStatusError}>读取失败</span>
        ) : status?.exists ? (
          <span className={css.statusBadge}><i className={css.statusDotSmall} />已启用</span>
        ) : (
          <span className={css.statusBadgeMuted}>未生成</span>
        )}
        action={(
          <Button
            variant={status?.exists ? 'dangerGhost' : 'primary'}
            disabled={pending || error || resetting}
            onClick={() => status?.exists ? setConfirmOpen(true) : onReset(type)}
          >
            {resetting ? '处理中…' : status?.exists ? '重置 Token' : '生成 Token'}
          </Button>
        )}
      />

      <div className={css.credentialBody}>
        {error ? (
          <div className={css.credentialError}>WebDAV 凭据状态读取失败，请刷新页面后重试。</div>
        ) : (
          <div className={css.credentialFacts}>
            <div className={css.credentialFact}>
              <span className={css.credentialFactLabel}>挂载路径</span>
              <code className={css.credentialFactValue}>/dav</code>
            </div>
            <div className={css.credentialFact}>
              <span className={css.credentialFactLabel}>生成时间</span>
              <span className={css.credentialFactValue}>
                {pending ? '读取中…' : status?.created_at ? formatDate(status.created_at) : '尚未生成'}
              </span>
            </div>
            <div className={css.credentialFact}>
              <span className={css.credentialFactLabel}>最近使用</span>
              <span className={css.credentialFactValue}>
                {pending ? '读取中…' : status?.last_used_at ? formatDate(status.last_used_at) : '从未使用'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 重置 Token 确认弹窗 */}
      <DialogWrap
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="重置 WebDAV"
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
        onOpenChange={(open) => {
          if (open) setShowOpen(true)
          else closeTokenReveal()
        }}
        title="新的 Token"
        description="请立即复制保存，关闭后不再显示。"
        footer={
          <Button variant="secondary" onClick={closeTokenReveal}>
            关闭
          </Button>
        }
      >
        {newToken ? (
          <Field label="Token" htmlFor={tokenInputId}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input id={tokenInputId} readOnly value={newToken} />
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(newToken)}
              >
                复制
              </Button>
            </div>
          </Field>
        ) : null}
      </DialogWrap>
    </section>
  )
}

function ImageBedTokenManager() {
  const queryClient = useQueryClient()
  const tokens = useQuery({ queryKey: ['image-bed-tokens'], queryFn: fetchImageBedTokens })
  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const [revealedToken, setRevealedToken] = useState('')
  const [revealOpen, setRevealOpen] = useState(false)
  const [deleting, setDeleting] = useState<ImageBedToken | null>(null)
  const revealedTokenInputId = useId()

  const refreshTokenQueries = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['image-bed-tokens'] }),
      queryClient.invalidateQueries({ queryKey: ['token-status'] }),
    ])
  }

  const createMut = useMutation({
    mutationFn: createImageBedToken,
    onSuccess: (data) => {
      setCreateOpen(false)
      setLabel('')
      setMessage('')
      setRevealedToken(data.token)
      setRevealOpen(true)
      refreshTokenQueries()
    },
    onError: (error) => {
      setMessage(error instanceof ApiRequestError ? error.message : '创建失败')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteImageBedToken,
    onSuccess: () => {
      setDeleting(null)
      refreshTokenQueries()
    },
    onError: (error) => {
      alert(error instanceof ApiRequestError ? error.message : '撤销失败')
    },
  })

  const tokenItems = tokens.data ?? []
  const atLimit = tokenItems.length >= 10

  return (
    <section className={css.credentialGroup} aria-label="图床 API">
      <CredentialGroupHeader
        hint="为每台 PicGo 或第三方客户端创建独立 Token；最多 10 个，明文仅显示一次。"
        status={tokens.isPending ? (
          <span className={css.statusBadgeMuted}>正在读取</span>
        ) : tokens.isError ? (
          <span className={css.credentialStatusError}>读取失败</span>
        ) : tokenItems.length > 0 ? (
          <span className={css.statusBadge}><i className={css.statusDotSmall} />已启用 {tokenItems.length} 个</span>
        ) : (
          <span className={css.statusBadgeMuted}>未生成</span>
        )}
        action={(
          <Button
            disabled={atLimit || tokens.isPending || tokens.isError}
            title={atLimit ? '已达到 10 个 Token 上限' : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={14} />新建 Token
          </Button>
        )}
      />

      <div className={css.credentialBody}>
        {tokens.isPending ? <div className={css.credentialEmpty}>正在加载 Token…</div> : null}
        {tokens.isError ? <div className={css.credentialError}>Token 列表加载失败，请刷新页面后重试。</div> : null}
        {tokens.isSuccess && tokenItems.length === 0 ? (
          <div className={css.credentialEmpty}>暂无图床 Token。为每台客户端创建独立凭据，撤销时不会影响其他客户端。</div>
        ) : null}
        {tokenItems.length > 0 ? (
          <div className={css.credentialList} role="list" aria-label="图床 Token 列表">
            {tokenItems.map((token) => (
              <div key={token.token_id} className={css.credentialItem} role="listitem">
                <div className={css.credentialItemIdentity}>
                  <strong className={css.credentialItemName}>{token.label}</strong>
                  <code className={css.credentialItemId}>{token.token_id}</code>
                </div>
                <div className={css.credentialItemMeta}>
                  <span>创建于 {formatDate(token.created_at)}</span>
                  <span>{token.last_used_at ? `最近使用 ${formatDate(token.last_used_at)}` : '从未使用'}</span>
                </div>
                <div className={css.credentialItemActions}>
                  <Button variant="dangerGhost" onClick={() => setDeleting(token)} aria-label={`撤销 ${token.label}`}>
                    <IconTrash size={15} />撤销
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <DialogWrap
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setLabel('')
            setMessage('')
          }
        }}
        title="新建图床 Token"
        description="建议使用设备或客户端名称，便于后续单独撤销。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              disabled={createMut.isPending || !label.trim()}
              onClick={() => createMut.mutate(label.trim())}
            >
              {createMut.isPending ? '创建中…' : '创建 Token'}
            </Button>
          </>
        }
      >
        <Field label="Token 名称" required error={message} hint={message ? undefined : '例如：MacBook PicGo'}>
          <Input
            autoFocus
            value={label}
            maxLength={32}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="1-32 个字符"
          />
        </Field>
      </DialogWrap>

      <DialogWrap
        open={revealOpen}
        onOpenChange={(open) => {
          setRevealOpen(open)
          if (!open) setRevealedToken('')
        }}
        title="新的图床 Token"
        description="请立即复制保存。关闭后无法再次查看明文。"
        footer={<Button variant="secondary" onClick={() => setRevealOpen(false)}>我已保存</Button>}
      >
        <Field label="Token" htmlFor={revealedTokenInputId}>
          <div className={css.tokenRevealRow}>
            <Input id={revealedTokenInputId} readOnly value={revealedToken} />
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealedToken)}>复制</Button>
          </div>
        </Field>
      </DialogWrap>

      <DialogWrap
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="撤销图床 Token"
        description="撤销后，使用该 Token 的客户端将立即无法上传。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.token_id)}
            >
              {deleteMut.isPending ? '撤销中…' : '确认撤销'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          即将撤销“{deleting?.label}”。其他图床 Token 不受影响。
        </p>
      </DialogWrap>
    </section>
  )
}

function S3CredentialManager() {
  const queryClient = useQueryClient()
  const credentials = useQuery({ queryKey: ['s3-credentials'], queryFn: fetchS3Credentials })
  const sources = useQuery({ queryKey: ['my-sources'], queryFn: fetchMySources })
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [revealed, setRevealed] = useState<{ accessKeyId: string; secret: string } | null>(null)
  const [deleting, setDeleting] = useState<S3Credential | null>(null)
  const [copiedBucket, setCopiedBucket] = useState<string | null>(null)
  const accessKeyInputId = useId()
  const secretKeyInputId = useId()

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['s3-credentials'] })
  }

  const createMut = useMutation({
    mutationFn: createS3Credential,
    onSuccess: (data) => {
      setCreateOpen(false)
      setName('')
      setMessage('')
      setRevealed({ accessKeyId: data.item.access_key_id, secret: data.secret_access_key })
      refresh()
    },
    onError: (error) => setMessage(error instanceof ApiRequestError ? error.message : '创建失败'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ accessKeyId, disabled }: { accessKeyId: string; disabled: boolean }) =>
      setS3CredentialDisabled(accessKeyId, disabled),
    onSuccess: refresh,
    onError: (error) => alert(error instanceof ApiRequestError ? error.message : '更新失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteS3Credential,
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
    onError: (error) => alert(error instanceof ApiRequestError ? error.message : '撤销失败'),
  })

  const items = credentials.data ?? []
  const enabledCount = items.reduce((count, item) => count + (item.is_disabled ? 0 : 1), 0)
  const atLimit = items.length >= 10

  function copyBucket(bucket: string) {
    void navigator.clipboard.writeText(bucket).then(() => {
      setCopiedBucket(bucket)
      setTimeout(() => setCopiedBucket((current) => current === bucket ? null : current), 1400)
    })
  }

  return (
    <section className={css.credentialGroup} aria-label="S3 Access Key">
      <CredentialGroupHeader
        hint="供 AWS CLI、rclone 等客户端访问已授权存储源；最多 10 个，Secret 仅显示一次。"
        status={credentials.isPending ? (
          <span className={css.statusBadgeMuted}>正在读取</span>
        ) : credentials.isError ? (
          <span className={css.credentialStatusError}>读取失败</span>
        ) : enabledCount > 0 ? (
          <span className={css.statusBadge}><i className={css.statusDotSmall} />已启用 {enabledCount} 个</span>
        ) : items.length > 0 ? (
          <span className={css.statusBadgeMuted}>{items.length} 个已禁用</span>
        ) : (
          <span className={css.statusBadgeMuted}>未生成</span>
        )}
        action={(
          <Button
            disabled={atLimit || credentials.isPending || credentials.isError}
            title={atLimit ? '已达到 10 个凭据上限' : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={14} />新建凭据
          </Button>
        )}
      />

      <div className={css.credentialBody}>
        {credentials.isPending ? <div className={css.credentialEmpty}>正在加载 S3 凭据…</div> : null}
        {credentials.isError ? <div className={css.credentialError}>S3 凭据列表加载失败，请刷新页面后重试。</div> : null}
        {credentials.isSuccess && items.length === 0 ? (
          <div className={css.credentialEmpty}>暂无 S3 凭据。建议为每台客户端创建独立 Access Key。</div>
        ) : null}
        {items.length > 0 ? (
          <div className={css.credentialList} role="list" aria-label="S3 凭据列表">
            {items.map((credential) => (
              <div key={credential.access_key_id} className={css.credentialItem} role="listitem">
                <div className={css.credentialItemIdentity}>
                  <strong className={css.credentialItemName}>{credential.name}</strong>
                  <code className={css.credentialItemId}>{credential.access_key_id}</code>
                </div>
                <div className={css.credentialItemMeta}>
                  <Badge color={credential.is_disabled ? 'gray' : 'green'}>
                    {credential.is_disabled ? '已禁用' : '已启用'}
                  </Badge>
                  <span>创建于 {formatDate(credential.created_at)}</span>
                  <span>{credential.last_used_at ? `最近使用 ${formatDate(credential.last_used_at)}` : '从未使用'}</span>
                </div>
                <div className={css.credentialItemActions}>
                  <Button
                    variant="ghost"
                    disabled={toggleMut.isPending}
                    onClick={() => toggleMut.mutate({
                      accessKeyId: credential.access_key_id,
                      disabled: !credential.is_disabled,
                    })}
                  >
                    {credential.is_disabled ? '启用' : '禁用'}
                  </Button>
                  <Button variant="dangerGhost" onClick={() => setDeleting(credential)} aria-label={`撤销 ${credential.name}`}>
                    <IconTrash size={15} />撤销
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {sources.isSuccess && sources.data.length > 0 ? (
          <div className={css.credentialSubsection}>
            <div className={css.credentialSubsectionHeader}>
              <h4 className={css.credentialSubsectionTitle}>Bucket 映射</h4>
              <p className={css.credentialSubsectionHint}>按存储源名称复制系统生成的 Bucket 值。</p>
            </div>
            <div className={css.bucketList} role="list" aria-label="S3 Bucket 映射">
              {sources.data.map((source) => (
                <div key={source.key} className={css.bucketRow} role="listitem">
                  <div className={css.credentialItemIdentity}>
                    <strong className={css.credentialItemName}>{source.name}</strong>
                    <code className={css.credentialItemId}>{source.key}</code>
                  </div>
                  <Button variant="ghost" onClick={() => copyBucket(source.key)}>
                    {copiedBucket === source.key ? '已复制' : '复制 Bucket'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <DialogWrap
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setName('')
            setMessage('')
          }
        }}
        title="新建 S3 凭据"
        description="使用设备或客户端名称，便于后续单独禁用或撤销。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !name.trim()} onClick={() => createMut.mutate(name.trim())}>
              {createMut.isPending ? '创建中…' : '创建凭据'}
            </Button>
          </>
        }
      >
        <Field label="凭据名称" required error={message} hint={message ? undefined : '例如：MacBook rclone'}>
          <Input
            autoFocus
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="1-32 个字符"
          />
        </Field>
      </DialogWrap>

      <DialogWrap
        open={revealed !== null}
        onOpenChange={(open) => { if (!open) setRevealed(null) }}
        title="新的 S3 凭据"
        description="请立即复制 Access Key ID 与 Secret Access Key。关闭后无法再次查看 Secret。"
        footer={<Button variant="secondary" onClick={() => setRevealed(null)}>我已保存</Button>}
      >
        <Field label="Access Key ID" htmlFor={accessKeyInputId}>
          <div className={css.tokenRevealRow}>
            <Input id={accessKeyInputId} readOnly value={revealed?.accessKeyId ?? ''} />
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealed?.accessKeyId ?? '')}>复制</Button>
          </div>
        </Field>
        <Field label="Secret Access Key" htmlFor={secretKeyInputId}>
          <div className={css.tokenRevealRow}>
            <Input id={secretKeyInputId} readOnly value={revealed?.secret ?? ''} />
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealed?.secret ?? '')}>复制</Button>
          </div>
        </Field>
      </DialogWrap>

      <DialogWrap
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="撤销 S3 凭据"
        description="撤销后，使用该 Access Key 的客户端将立即无法访问。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.access_key_id)}
            >
              {deleteMut.isPending ? '撤销中…' : '确认撤销'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          即将撤销“{deleting?.name}”。其他 S3 凭据不受影响。
        </p>
      </DialogWrap>
    </section>
  )
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

// --- 系统配置包导出 ---

function BackupSection() {
  const [message, setMessage] = useState('')
  const exportMutation = useMutation({
    mutationFn: adminExportSystemConfig,
    onSuccess: (filename) => setMessage(`已生成并下载 ${filename}`),
    onError: (error) => setMessage(error instanceof ApiRequestError ? error.message : '导出失败，请稍后重试'),
  })

  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>导出系统配置包</h2>
        <p className={css.sectionHint}>生成当前实例的可迁移配置快照，用于人工备份或故障恢复。</p>
      </div>
      <div className={css.sectionBody}>
        <div className={css.exportSummary}>
          <span className={css.exportIcon}><IconDownload size={22} /></span>
          <div className={css.exportCopy}>
            <strong>数据库、配置与密钥材料</strong>
            <span className={css.exportCopySecondary}>包含 SQLite 一致性快照、生效配置、恢复说明，以及 keys 目录中的普通文件。</span>
          </div>
          <div className={css.exportAction}>
            <Button
              onClick={() => {
                setMessage('')
                exportMutation.mutate()
              }}
              disabled={exportMutation.isPending}
            >
              <IconDownload size={16} />
              {exportMutation.isPending ? '正在生成…' : '导出配置包'}
            </Button>
          </div>
        </div>
        <div className={css.exportNotice} role="note">
          <strong>配置包包含敏感系统数据，请按备份凭据保管。</strong>
          <span className={css.exportCopySecondary}>不会包含存储源中的真实文件、缓存、上传临时文件或日志；这些内容需要单独备份。</span>
        </div>
        {message ? (
          <p className={exportMutation.isError ? css.exportMessageError : css.exportMessage} role="status">
            {message}
          </p>
        ) : null}
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
          label="公开盘"
          value={o?.public_drive_enabled ? '已开启' : '未开启'}
          valueIsText
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
          <h2 id="source-overview-title" className={css.sectionTitle}>存储源概览</h2>
          <p className={css.sectionHint}>
            共 {o?.sources.length ?? 0} 个存储源，详细配置请见"存储源"。
          </p>
        </div>
        <HorizontalDataRegion name="存储源概览" labelledBy="source-overview-title">
          <table className={css.compactTable}>
            <thead>
              <tr>
                <th className={css.compactTh}>名称</th>
                <th className={css.compactTh}>真实路径</th>
                <th className={css.compactTh}>协议</th>
                <th className={css.compactTh}>状态</th>
              </tr>
            </thead>
            <tbody>
              {o?.sources.length === 0 && (
                <tr>
                  <td colSpan={4} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                    还没有存储源。
                  </td>
                </tr>
              )}
              {o?.sources.map((s) => (
                <tr key={s.key} className={css.compactTr}>
                  <td className={css.compactTd} style={{ fontWeight: 500 }}>{s.name}</td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary, fontFamily: vars.font.mono }}>
                    {s.root_path}
                  </td>
                  <td className={css.compactTd}>
                    {[
                      s.webdav_enabled ? 'WebDAV' : null,
                      s.s3_enabled ? 'S3' : null,
                    ].filter(Boolean).join(' / ') || '—'}
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
        </HorizontalDataRegion>
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
        <header className={css.sectionHeaderWithAction}>
          <div className={css.sectionHeaderCopy}>
            <h2 id="storage-sources-title" className={css.sectionTitle}>存储源</h2>
            <p className={css.sectionHint}>
              共 {sources.data?.length ?? 0} 个 · 连接真实目录并统一管理访问能力。
            </p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus size={14} /> 新建存储源
            </Button>
          </div>
        </header>
        <HorizontalDataRegion name="存储源" labelledBy="storage-sources-title" busy={sources.isPending}>
          <div className={css.sourceList} role="list" aria-labelledby="storage-sources-title" aria-busy={sources.isPending}>
            {sources.isPending ? (
              <div className={css.sourceState} role="status">正在加载存储源…</div>
            ) : null}
            {sources.isError ? (
              <div className={css.sourceState} role="alert">
                <p className={css.sourceStateTitle}>无法加载存储源</p>
                <p className={css.sourceStateHint}>请检查服务状态后重试。</p>
                <Button variant="secondary" onClick={() => sources.refetch()}>重新加载</Button>
              </div>
            ) : null}
            {sources.data?.map((s) => (
              <article key={s.key} className={css.sourceItem} role="listitem" aria-label={`存储源 ${s.name}`}>
                <div className={css.sourceIdentity}>
                  <span className={css.sourceIcon} aria-hidden="true"><IconServer size={18} /></span>
                  <div className={css.sourceCopy}>
                    <h3 className={css.sourceName}>{s.name}</h3>
                    <code className={css.sourcePath} title={s.root_path}>{s.root_path}</code>
                  </div>
                </div>
                <div className={css.sourceMeta} aria-label={`${s.name} 状态信息`}>
                  <div className={css.sourceMetaItem}>
                    <span className={css.sourceMetaLabel}>状态</span>
                      <Badge color={s.is_disabled ? 'gray' : 'green'}>
                        {s.is_disabled ? '已禁用' : '正常'}
                      </Badge>
                  </div>
                  <div className={css.sourceMetaItem}>
                    <span className={css.sourceMetaLabel}>配额</span>
                    <span className={css.sourceMetaValue}>{s.quota_bytes > 0 ? formatBytes(s.quota_bytes) : '不限'}</span>
                  </div>
                  <div className={css.sourceMetaItem}>
                    <span className={css.sourceMetaLabel}>协议</span>
                    <span className={css.sourceMetaValue}>
                      {[
                        s.webdav_enabled ? 'WebDAV' : null,
                        s.s3_enabled ? 'S3' : null,
                      ].filter(Boolean).join(' / ') || '—'}
                    </span>
                  </div>
                </div>
                <div className={css.sourceActions} aria-label={`${s.name} 操作`}>
                  <Button variant="ghost" onClick={() => setEditId(s.key)} aria-label={`配置存储源 ${s.name}`}>
                    配置
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => disableMut.mutate({ id: s.key, disabled: !s.is_disabled })}
                    disabled={disableMut.isPending}
                    aria-label={`${s.is_disabled ? '启用' : '禁用'}存储源 ${s.name}`}
                  >
                    {s.is_disabled ? '启用' : '禁用'}
                  </Button>
                  <Button variant="dangerGhost" onClick={() => setDeleting(s)} aria-label={`删除存储源 ${s.name}`}>
                    <IconTrash size={14} /> 删除
                  </Button>
                </div>
              </article>
            ))}
            {sources.isSuccess && sources.data.length === 0 && (
              <div className={css.sourceState}>
                <p className={css.sourceStateTitle}>还没有存储源</p>
                <p className={css.sourceStateHint}>使用右上角的“新建存储源”连接第一个真实目录。</p>
              </div>
            )}
          </div>
        </HorizontalDataRegion>
      </section>

      {/* 新建存储源 弹窗 */}
      <CreateSourceDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 编辑存储源 弹窗 */}
      {editId && (
        <EditSourceDialog
          sourceKey={editId}
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
              onClick={() => deleting && deleteMut.mutate(deleting.key)}
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
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<SourcePreflight | null>(null)
  const requestedRootPath = useRef('')

  const preflightMutation = useMutation({
    mutationFn: adminPreflightSource,
    onSuccess: (result, variables) => {
      if (requestedRootPath.current === variables.root_path) setPreview(result)
    },
  })

  const createMutation = useMutation({
    mutationFn: adminCreateSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (!open) {
      setName('')
      setRootPath('')
      setErr('')
      setPreview(null)
      requestedRootPath.current = ''
    }
  }, [open])

  function validateInput() {
    if (!name.trim()) return '请输入存储源名称'
    if (!rootPath.trim()) return '请输入服务端可访问的目录绝对路径'
    return ''
  }

  function runPreflight() {
    setErr('')
    const validationError = validateInput()
    if (validationError) {
      setErr(validationError)
      return
    }

    setPreview(null)
    requestedRootPath.current = rootPath.trim()
    preflightMutation.mutate(
      { root_path: requestedRootPath.current },
      { onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '目录预检失败') },
    )
  }

  function createSource() {
    setErr('')
    const validationError = validateInput()
    if (validationError) {
      setErr(validationError)
      return
    }
    if (!preview || requestedRootPath.current !== rootPath.trim()) {
      setErr('目录路径已变更，请重新预检')
      return
    }

    createMutation.mutate(
      {
        name: name.trim(),
        description: '',
        root_path: preview.root_path,
        exclude_patterns: preview.exclude_patterns,
        import_existing: !preview.is_empty,
      },
      { onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '创建失败') },
    )
  }

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="新建存储源"
      description={preview ? '目录预检已通过，请核对内容后确认创建。' : '先预检已有目录；通过后再确认创建存储源。'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          {preview ? (
            <>
              <Button variant="ghost" onClick={runPreflight} disabled={preflightMutation.isPending || createMutation.isPending}>
                重新预检
              </Button>
              <Button onClick={createSource} disabled={createMutation.isPending}>
                {createMutation.isPending ? '校准并创建中…' : preview.is_empty ? '确认创建' : '确认导入并校准'}
              </Button>
            </>
          ) : (
            <Button
              onClick={runPreflight}
              disabled={preflightMutation.isPending || !name.trim() || !rootPath.trim()}
            >
              {preflightMutation.isPending ? '预检中…' : '预检目录'}
            </Button>
          )}
        </>
      }
    >
      <Field label="名称" required hint="显示在列表和客户端连接信息中">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：团队文件"
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
          onChange={(e) => {
            setRootPath(e.target.value)
            setPreview(null)
            setErr('')
            requestedRootPath.current = ''
          }}
          placeholder="例如 /mnt/photos 或 D:\\Photos"
        />
      </Field>
      {preview ? <SourcePreflightPreview preview={preview} /> : null}
    </DialogWrap>
  )
}

const sourceEntryKindLabels: Record<SourcePreflight['entries'][number]['kind'], string> = {
  file: '文件',
  directory: '目录',
  symlink: '符号链接',
  unsupported: '不支持',
}

function SourcePreflightPreview({ preview }: { preview: SourcePreflight }) {
  const summary = preview.summary
  return (
    <section className={css.sourcePreview} aria-label="目录预检结果">
      <div className={css.sourcePreviewHeader}>
        <div>
          <span className={css.sourcePreviewEyebrow}>安全与读写预检通过</span>
          <code className={css.sourcePreviewPath}>{preview.root_path}</code>
        </div>
        <Badge color="green">可导入</Badge>
      </div>
      <div className={css.sourcePreviewStats}>
        <span><strong className={css.sourcePreviewStatValue}>{summary.total_entries}</strong>首层条目</span>
        <span><strong className={css.sourcePreviewStatValue}>{summary.files}</strong>文件</span>
        <span><strong className={css.sourcePreviewStatValue}>{summary.directories}</strong>目录</span>
        <span><strong className={css.sourcePreviewStatValue}>{summary.excluded_entries}</strong>已排除</span>
      </div>
      {preview.entries.length > 0 ? (
        <div className={css.sourcePreviewEntries}>
          {preview.entries.map((entry) => (
            <div className={css.sourcePreviewEntry} key={entry.name}>
              <span className={css.sourcePreviewEntryName} title={entry.name}>{entry.name}</span>
              <Badge color={entry.kind === 'symlink' || entry.kind === 'unsupported' ? 'red' : 'gray'}>
                {sourceEntryKindLabels[entry.kind]}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className={css.sourcePreviewEmpty}>目录为空，创建后可以直接上传文件。</p>
      )}
      {preview.warnings.length > 0 ? (
        <ul className={css.sourcePreviewWarnings}>
          {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  )
}

// --- 编辑存储源 弹窗（协议开关 + 排除规则；产品功能开关在 Site Capability 设置）---

function EditSourceDialog({
  sourceKey,
  onClose,
}: {
  sourceKey: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['admin-source', sourceKey], queryFn: () => adminGetSource(sourceKey) })

  const [patterns, setPatterns] = useState<string | null>(null)
  const [webdavOn, setWebdavOn] = useState<boolean | null>(null)
  const [s3On, setS3On] = useState<boolean | null>(null)
  const [quotaGiB, setQuotaGiB] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  // 打开弹窗时，把当前值同步到本地 state
  useEffect(() => {
    if (detail.isSuccess) {
      setPatterns(detail.data.exclude_patterns.join('\n'))
      setWebdavOn(detail.data.source.webdav_enabled)
      setS3On(detail.data.source.s3_enabled)
      setQuotaGiB(quotaGiBInputValue(detail.data.source.quota_bytes))
    }
  }, [detail.isSuccess, detail.data])

  const updateMut = useMutation({
    mutationFn: (input: Parameters<typeof adminUpdateSource>[1]) => adminUpdateSource(sourceKey, input),
    onSuccess: () => {
      refresh()
      onClose()
    },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  const reconcileMut = useMutation({
    mutationFn: () => adminReconcileSource(sourceKey),
    onSuccess: (result) => {
      setMsg(`台账已校准：扫描 ${result.scanned_files} 个文件，新增 ${result.added}，更新 ${result.updated}，移除 ${result.removed}`)
      refresh()
    },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '校准失败'),
  })
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-source', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
  }

  if (!detail.isSuccess) return null
  const src: AdminSource = detail.data.source
  const patternsValue = patterns ?? detail.data.exclude_patterns.join('\n')
  const quotaValue = quotaGiB ?? quotaGiBInputValue(src.quota_bytes)
  const quotaNumber = Number(quotaValue)
  const quotaBytes = Math.round(quotaNumber * 1024 ** 3)
  const quotaValid = quotaValue.trim() !== ''
    && Number.isFinite(quotaNumber)
    && quotaNumber >= 0
    && Number.isSafeInteger(quotaBytes)
  const webdavEnabled = webdavOn ?? src.webdav_enabled
  const s3Enabled = s3On ?? src.s3_enabled
  const excludePatterns = patternsValue
    .split('\n')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
  const originalPatterns = detail.data.exclude_patterns.map((pattern) => pattern.trim()).filter(Boolean)
  const patternsChanged = excludePatterns.length !== originalPatterns.length
    || excludePatterns.some((pattern, index) => pattern !== originalPatterns[index])
  const isDirty = webdavEnabled !== src.webdav_enabled
    || s3Enabled !== src.s3_enabled
    || quotaBytes !== src.quota_bytes
    || patternsChanged
  const formValid = quotaValid

  function saveSettings() {
    setMsg('')
    if (!quotaValid) {
      setMsg('请输入有效的非负配额')
      return
    }
    updateMut.mutate({
      webdav_enabled: webdavEnabled,
      s3_enabled: s3Enabled,
      quota_bytes: quotaBytes,
      exclude_patterns: excludePatterns,
    })
  }

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title={`配置：${src.name}`}
      description={`真实路径：${src.root_path}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            disabled={!isDirty || !formValid || updateMut.isPending}
            onClick={saveSettings}
          >
            {updateMut.isPending ? '保存中…' : '保存设置'}
          </Button>
        </>
      }
    >
      <Field label="访问协议" hint="修改后随底部按钮统一保存；产品功能（公开盘、图床等）在「站点服务」设置">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={webdavEnabled}
              onChange={(e) => {
                setWebdavOn(e.target.checked)
                setMsg('')
              }}
            />
            启用 WebDAV（该存储源可作为 WebDAV 挂载点）
          </label>
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={s3Enabled}
              onChange={(e) => {
                setS3On(e.target.checked)
                setMsg('')
              }}
            />
            启用 S3（该存储源可作为 Path-style Bucket）
          </label>
        </div>
      </Field>

      <Field
        label="存储源硬配额"
        hint={`当前已使用 ${formatBytes(detail.data.quota.usage_bytes)}；填 0 表示不限制。配额不会删除已有文件。`}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            type="number"
            min="0"
            step="0.001"
            value={quotaValue}
            onChange={(event) => {
              setQuotaGiB(event.target.value)
              setMsg('')
            }}
            aria-label="存储源配额 GiB"
          />
          <span style={{ color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>GiB</span>
        </div>
      </Field>

      <Field
        label="文件台账"
        hint={isDirty
          ? '请先保存当前配置，再扫描并校准台账。'
          : `当前台账用量 ${formatBytes(detail.data.ledger_usage_bytes)}。校准会扫描真实目录，新发现文件标记为未归属。`}
      >
        <Button
          variant="secondary"
          disabled={isDirty || reconcileMut.isPending || updateMut.isPending}
          onClick={() => reconcileMut.mutate()}
        >
          {reconcileMut.isPending ? '校准中…' : '扫描并校准台账'}
        </Button>
      </Field>

      <Field
        label="排除规则（每行一条 glob）"
        hint="匹配的文件不会出现在文件列表中，例如 *.tmp 或 .git/*"
      >
        <textarea
          className={fieldCss.textarea}
          value={patternsValue}
          onChange={(e) => {
            setPatterns(e.target.value)
            setMsg('')
          }}
        />
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

// --- 访问策略 ---

function PoliciesSection() {
  const queryClient = useQueryClient()
  const policies = useQuery({ queryKey: ['admin-policies'], queryFn: adminListPolicies })
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AccessPolicy | null>(null)
  const [deleting, setDeleting] = useState<AccessPolicy | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-policies'] })
    queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
  }
  const deleteMutation = useMutation({
    mutationFn: adminDeletePolicy,
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
    onError: (error) => alert(error instanceof ApiRequestError ? error.message : '删除失败'),
  })

  return (
    <>
      <section className={css.section}>
        <header className={css.sectionHeaderWithAction}>
          <div className={css.sectionHeaderCopy}>
            <h2 id="access-policies-title" className={css.sectionTitle}>访问策略</h2>
            <p className={css.sectionHint}>
              共 {policies.data?.length ?? 0} 个 · 将多个存储源权限组合成策略，再统一绑定用户。
            </p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus size={14} /> 新建策略
            </Button>
          </div>
        </header>
        <HorizontalDataRegion name="访问策略" labelledBy="access-policies-title">
          <table className={`${css.compactTable} ${css.compactTableWide}`}>
            <thead>
              <tr>
                <th className={css.compactTh}>名称</th>
                <th className={css.compactTh}>存储源规则</th>
                <th className={css.compactTh}>用户</th>
                <th className={css.compactTh}>操作</th>
              </tr>
            </thead>
            <tbody>
              {policies.data?.map((policy) => (
                <tr key={policy.key} className={css.compactTr}>
                  <td className={css.compactTd}>
                    <div style={{ fontWeight: 600 }}>{policy.name}</div>
                    {policy.description ? (
                      <div className={css.policyEditorMeta}>{policy.description}</div>
                    ) : null}
                  </td>
                  <td className={css.compactTd}>
                    <div className={css.policySummary}>
                      {policy.sources.length === 0 ? '—' : policy.sources.map((rule) => (
                        <Badge key={rule.source_key} color={rule.permission === 'read_write' ? 'blue' : 'gray'}>
                          {rule.source_name} · {rule.permission === 'read_write' ? '读写' : '只读'}
                          {rule.path_rules.length > 0 ? ` · ${rule.path_rules.length} 个子路径` : ''}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={css.compactTd}>
                    {policy.users.length === 0
                      ? '—'
                      : policy.users.map((user) => user.display_name || user.username).join('、')}
                  </td>
                  <td className={css.compactTd}>
                    <div className={css.formRow}>
                      <Button variant="ghost" onClick={() => setEditing(policy)}>编辑</Button>
                      <Button
                        variant="danger"
                        aria-label={`删除策略 ${policy.name}`}
                        onClick={() => setDeleting(policy)}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {policies.isSuccess && policies.data.length === 0 ? (
            <p className={css.policyEditorEmpty}>还没有访问策略，普通用户暂时无法访问私有存储源。</p>
          ) : null}
        </HorizontalDataRegion>
      </section>

      <PolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sources={sources.data ?? []}
        users={users.data ?? []}
        onSaved={refresh}
      />
      {editing ? (
        <PolicyDialog
          open
          policy={editing}
          onOpenChange={(open) => { if (!open) setEditing(null) }}
          sources={sources.data ?? []}
          users={users.data ?? []}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}
      <DialogWrap
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="删除访问策略"
        description={`确定删除「${deleting?.name ?? ''}」吗？`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.key)}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: vars.color.text, fontSize: vars.fontSize.sm }}>
          删除后，依赖该策略获得的访问权限会立即失效，不会删除存储源或真实文件。
        </p>
      </DialogWrap>
    </>
  )
}

function PolicyDialog({
  open,
  policy,
  sources,
  users,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  policy?: AccessPolicy
  sources: AdminSource[]
  users: User[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourcePermissions, setSourcePermissions] = useState<Record<string, AccessPermission>>({})
  const [sourcePathRules, setSourcePathRules] = useState<Record<string, Array<AccessPolicyPathRule & { id: string }>>>({})
  const [userIDs, setUserIDs] = useState<number[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setName(policy?.name ?? '')
    setDescription(policy?.description ?? '')
    setSourcePermissions(Object.fromEntries(
      policy?.sources.map((rule) => [rule.source_key, rule.permission]) ?? [],
    ))
    setSourcePathRules(Object.fromEntries(
      policy?.sources.map((rule) => [rule.source_key, rule.path_rules.map((pathRule) => ({
        ...pathRule,
        id: crypto.randomUUID(),
      }))]) ?? [],
    ))
    setUserIDs(policy?.users.map((user) => user.user_id) ?? [])
    setMessage('')
  }, [open, policy])

  const saveMutation = useMutation({
    mutationFn: (input: AccessPolicyInput) => policy
      ? adminUpdatePolicy(policy.key, input)
      : adminCreatePolicy(input),
    onSuccess: () => {
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => setMessage(error instanceof ApiRequestError ? error.message : '保存失败'),
  })

  function toggleSource(sourceKey: string, checked: boolean) {
    setSourcePermissions((current) => {
      if (checked) return { ...current, [sourceKey]: current[sourceKey] ?? 'read_only' }
      const next = { ...current }
      delete next[sourceKey]
      return next
    })
    if (!checked) {
      setSourcePathRules((current) => {
        const next = { ...current }
        delete next[sourceKey]
        return next
      })
    }
  }

  function addPathRule(sourceKey: string) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: [
        ...(current[sourceKey] ?? []),
        { id: crypto.randomUUID(), path_prefix: '', permission: 'read_write' },
      ],
    }))
  }

  function updatePathRule(sourceKey: string, id: string, patch: Partial<AccessPolicyPathRule>) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: (current[sourceKey] ?? []).map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }))
  }

  function removePathRule(sourceKey: string, id: string) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: (current[sourceKey] ?? []).filter((rule) => rule.id !== id),
    }))
  }

  function toggleUser(userID: number, checked: boolean) {
    setUserIDs((current) => checked
      ? current.includes(userID) ? current : [...current, userID]
      : current.filter((id) => id !== userID))
  }

  function save() {
    if (!name.trim()) {
      setMessage('请输入策略名称')
      return
    }
    if (Object.values(sourcePathRules).some((rules) => rules.some((rule) => !rule.path_prefix.trim()))) {
      setMessage('请填写完整的子路径，或删除空规则')
      return
    }
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      sources: sources.flatMap((source) => {
        const permission = sourcePermissions[source.key]
        return permission ? [{
          source_key: source.key,
          permission,
          path_rules: (sourcePathRules[source.key] ?? []).map(({ path_prefix, permission: pathPermission }) => ({
            path_prefix: path_prefix.trim(),
            permission: pathPermission,
          })),
        }] : []
      }),
      user_ids: userIDs,
    })
  }

  const assignableUsers = users.filter((user) => user.role !== 'super_admin')
  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title={policy ? '编辑访问策略' : '新建访问策略'}
      description="先设置存储源默认权限，再按需用最长路径前缀覆盖子目录权限。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={saveMutation.isPending || !name.trim()} onClick={save}>
            {saveMutation.isPending ? '保存中…' : '保存策略'}
          </Button>
        </>
      }
    >
      <Field label="策略名称" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：内容团队"
        />
      </Field>
      <Field label="说明" hint="说明策略适用的人群或用途">
        <textarea
          className={fieldCss.textarea}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="例如：内容团队日常读写权限"
        />
      </Field>
      <Field label="存储源规则" hint="未选中的存储源不授权；子路径使用源内相对路径，不以 / 开头">
        <div className={css.policyEditorList}>
          {sources.length === 0 ? <p className={css.policyEditorEmpty}>请先创建存储源。</p> : null}
          {sources.map((source) => {
            const permission = sourcePermissions[source.key]
            const pathRules = sourcePathRules[source.key] ?? []
            return (
              <div key={source.key} className={css.policySourceBlock}>
                <div className={css.policyEditorRow}>
                  <label className={css.policyEditorIdentity}>
                    <input
                      type="checkbox"
                      className={fieldCss.checkbox}
                      checked={!!permission}
                      onChange={(event) => toggleSource(source.key, event.target.checked)}
                    />
                    <span>
                      {source.name}
                      {source.is_disabled ? <span className={css.policyEditorMeta}> · 已禁用</span> : null}
                    </span>
                  </label>
                  {permission ? (
                    <Select
                      value={permission}
                      onValueChange={(value) => setSourcePermissions((current) => ({
                        ...current,
                        [source.key]: value as AccessPermission,
                      }))}
                      options={[
                        { value: 'read_only', label: '默认只读' },
                        { value: 'read_write', label: '默认读写' },
                      ]}
                      ariaLabel={`${source.name}默认权限`}
                      width="content"
                    />
                  ) : null}
                </div>
                {permission ? (
                  <div className={css.policyPathRules}>
                    {pathRules.map((pathRule) => (
                      <div key={pathRule.id} className={css.policyPathRuleRow}>
                        <Input
                          value={pathRule.path_prefix}
                          onChange={(event) => updatePathRule(source.key, pathRule.id, { path_prefix: event.target.value })}
                          placeholder="例如：team/drafts"
                          aria-label={`${source.name}子路径`}
                        />
                        <Select
                          value={pathRule.permission}
                          onValueChange={(value) => updatePathRule(source.key, pathRule.id, {
                            permission: value as AccessPermission,
                          })}
                          options={[
                            { value: 'read_only', label: '只读' },
                            { value: 'read_write', label: '读写' },
                          ]}
                          ariaLabel={`${pathRule.path_prefix || source.name}子路径权限`}
                          width="content"
                        />
                        <Button
                          variant="ghost"
                          aria-label={`删除 ${source.name} 子路径规则`}
                          onClick={() => removePathRule(source.key, pathRule.id)}
                        >
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => addPathRule(source.key)}>
                      <IconPlus size={14} /> 添加子路径覆盖
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Field>
      <Field label="绑定用户" hint="超级管理员无需绑定，始终拥有全部读写权限">
        <div className={css.policyEditorList}>
          {assignableUsers.length === 0 ? <p className={css.policyEditorEmpty}>还没有可绑定的普通用户。</p> : null}
          {assignableUsers.map((user) => (
            <label key={user.id} className={css.policyEditorRow}>
              <span className={css.policyEditorIdentity}>
                <input
                  type="checkbox"
                  className={fieldCss.checkbox}
                  checked={userIDs.includes(user.id)}
                  onChange={(event) => toggleUser(user.id, event.target.checked)}
                />
                <span>{user.display_name || user.username}</span>
              </span>
              <span className={css.policyEditorMeta}>@{user.username}</span>
            </label>
          ))}
        </div>
      </Field>
      {message ? (
        <p role="status" style={{ margin: 0, color: vars.color.danger, fontSize: vars.fontSize.sm }}>
          {message}
        </p>
      ) : null}
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
  const [revokingCredentials, setRevokingCredentials] = useState<User | null>(null)
  const [quotaEditing, setQuotaEditing] = useState<AdminUser | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) => adminSetUserDisabled(id, disabled),
    onSuccess: refresh, onError: (err) => alert(err instanceof ApiRequestError ? err.message : '操作失败'),
  })
  const deleteMut = useMutation({
    mutationFn: adminDeleteUser, onSuccess: () => { setDeleting(null); refresh() },
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })
  const revokeCredentialsMut = useMutation({
    mutationFn: adminRevokeUserCredentials,
    onSuccess: (result) => {
      setRevokingCredentials(null)
      alert(`已撤销 ${result.sessions} 个会话、${result.webdav_tokens + result.image_bed_tokens + result.s3_credentials} 个客户端凭据`)
    },
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '撤销凭据失败'),
  })

  return (
    <>
      <section className={css.section}>
        <header className={css.sectionHeaderWithAction}>
          <div className={css.sectionHeaderCopy}>
            <h2 id="users-title" className={css.sectionTitle}>用户</h2>
            <p className={css.sectionHint}>共 {users.data?.length ?? 0} 个 · 用户首次登录后可自行修改密码。</p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button onClick={() => setCreateOpen(true)}>
              <IconUserPlus size={14} /> 创建用户
            </Button>
          </div>
        </header>
        <HorizontalDataRegion name="用户" labelledBy="users-title">
          <table className={`${css.compactTable} ${css.compactTableWide}`}>
            <thead>
              <tr>
                <th className={css.compactTh}>用户名</th>
                <th className={css.compactTh}>显示名</th>
                <th className={css.compactTh}>角色</th>
                <th className={css.compactTh}>状态</th>
                <th className={css.compactTh}>用量 / 配额</th>
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
                  <td className={css.compactTd}>
                    {formatBytes(u.usage_bytes)} / {u.quota_bytes > 0 ? formatBytes(u.quota_bytes) : '不限'}
                  </td>
                  <td className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td className={css.compactTd}>
                    {u.id !== me.data?.id ? (
                      <div className={css.formRow}>
                        <Button variant="ghost" onClick={() => setQuotaEditing(u)}>配额</Button>
                        <Button
                          variant="ghost"
                          onClick={() => disableMut.mutate({ id: u.id, disabled: !u.is_disabled })}
                        >
                          {u.is_disabled ? '启用' : '禁用'}
                        </Button>
                        <Button variant="ghost" onClick={() => setRevokingCredentials(u)}>
                          撤销凭据
                        </Button>
                        <Button variant="danger" onClick={() => setDeleting(u)}>
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    ) : (
                      <div className={css.formRow}>
                        <Button variant="ghost" onClick={() => setQuotaEditing(u)}>配额</Button>
                        <span className={css.kvLabel}>（当前用户）</span>
                      </div>
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
        </HorizontalDataRegion>
      </section>

      {/* 创建用户 弹窗 */}
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <UserQuotaDialog
        user={quotaEditing}
        onClose={() => setQuotaEditing(null)}
        onSaved={() => { setQuotaEditing(null); refresh() }}
      />

      <DialogWrap
        open={!!revokingCredentials}
        onOpenChange={(open) => { if (!open) setRevokingCredentials(null) }}
        title="撤销全部凭据"
        description={`立即阻断「${revokingCredentials?.username ?? ''}」当前已签发的访问凭据。`}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setRevokingCredentials(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => revokingCredentials && revokeCredentialsMut.mutate(revokingCredentials.id)}
              disabled={revokeCredentialsMut.isPending}
            >
              {revokeCredentialsMut.isPending ? '撤销中…' : '撤销全部凭据'}
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontSize: vars.fontSize.sm, color: vars.color.text }}>
          所有网页登录会话、WebDAV Token、图床 Token 和 S3 Key 将立即失效。账号、文件、分享与权限不会删除，用户仍可使用密码重新登录并创建新凭据。
        </p>
      </DialogWrap>

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

function UserQuotaDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}) {
  const [quotaGiB, setQuotaGiB] = useState('0')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (user) {
      setQuotaGiB(quotaGiBInputValue(user.quota_bytes))
      setMessage('')
    }
  }, [user])
  const mutation = useMutation({
    mutationFn: (quotaBytes: number) => adminSetUserQuota(user!.id, quotaBytes),
    onSuccess: onSaved,
    onError: (err) => setMessage(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  if (!user) return null
  const value = Number(quotaGiB)
  const valid = quotaGiB.trim() !== '' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 1024 ** 3))
  return (
    <DialogWrap
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`用户配额：${user.display_name || user.username}`}
      description={`当前拥有文件用量 ${formatBytes(user.usage_bytes)}；降低配额不会删除已有文件。`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate(Math.round(value * 1024 ** 3))}
          >
            {mutation.isPending ? '保存中…' : '保存配额'}
          </Button>
        </>
      )}
    >
      <Field label="硬配额" hint="单位 GiB，填 0 表示不限制；只统计归属于该用户的文件。">
        <Input
          type="number"
          min="0"
          step="0.001"
          value={quotaGiB}
          onChange={(event) => setQuotaGiB(event.target.value)}
          aria-label="用户配额 GiB"
        />
      </Field>
      {message ? <p role="alert">{message}</p> : null}
    </DialogWrap>
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
      entry_type: filters.entryType === 'all' ? undefined : filters.entryType as 'web' | 'webdav' | 's3' | 'image_bed' | 'anonymous_image_bed' | 'admin' | 'cli',
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
        <h2 id="audit-log-title" className={css.sectionTitle}>审计日志</h2>
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
      <HorizontalDataRegion name="审计日志" labelledBy="audit-log-title" busy={logs.isFetching}>
        <table className={`${css.compactTable} ${css.compactTableAudit}`}>
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
                <td className={css.compactTd}>
                  {auditActorLabel(log.actor_type) ?? log.actor_type}
                  {log.actor_user_id ? ` #${log.actor_user_id}` : ''}
                </td>
                <td className={css.compactTd}>{auditEntryLabel(log.entry_type) ?? log.entry_type}</td>
                <td className={css.compactTd}>{auditActionLabel(log.action) ?? log.action}</td>
                <td className={css.compactTd} style={{ fontFamily: vars.font.mono, color: vars.color.textSecondary }}>
                  {log.storage_source_name ?? '—'}
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
      </HorizontalDataRegion>
      <nav className={css.auditPagination} aria-label="审计日志分页">
        <span aria-live="polite">
          共 {total} 条，第 {Math.min(page, totalPages)} 页 / 共 {totalPages} 页
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
      </nav>
    </section>
  )
}

// --- 匿名图床（原 AdminSettings 的匿名图床 + 运行信息）---

function ImageBedSection() {
  const settings = useQuery({ queryKey: ['admin-anon-settings'], queryFn: adminGetAnonymousSettings })
  const capabilitiesQuery = useQuery({ queryKey: ['admin-capabilities'], queryFn: adminListCapabilities })
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

  return (
    <>
      <section className={css.section}>
        <header className={css.sectionHeaderWithAction}>
          <div className={css.sectionHeaderCopy}>
            <h2 id="anonymous-image-bed-title" className={css.sectionTitle}>匿名公共图床</h2>
            <p className={css.sectionHint}>
              默认关闭。开启后任何人无需登录即可通过 /upload 上传图片
              （单张最大 {anonStatus.data?.max_file_size_mb ?? '-'}MB，按 IP 限流）。
            </p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button onClick={() => setEditOpen(true)}>
              {settings.data.enabled ? '调整' : '开启'}
            </Button>
          </div>
        </header>
        <div className={css.sectionBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>当前状态</span>
            <span className={css.kvValue}>
              {settings.data.enabled ? (
                <>
                  <Badge color="green">已开启</Badge>
                  <span style={{ marginLeft: 8, color: vars.color.textSecondary }}>
                    图床目标：{capabilitiesQuery.data?.find((b) => b.capability === 'image_bed')?.source_name ?? '未绑定'}
                  </span>
                </>
              ) : (
                <Badge color="gray">未开启</Badge>
              )}
            </span>
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
        sourceKey={settings.data.key}
      />
    </>
  )
}

function AnonymousImageBedDialog({
  open,
  onOpenChange,
  enabled,
  sourceKey,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  enabled: boolean
  sourceKey: string
}) {
  const queryClient = useQueryClient()
  const retention = useQuery({
    queryKey: ['admin-image-bed-retention'],
    queryFn: adminGetImageBedRetention,
    enabled: open,
  })
  const [turnOn, setTurnOn] = useState(enabled)
  const [userDays, setUserDays] = useState('0')
  const [anonymousDays, setAnonymousDays] = useState('0')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedUser = Number(userDays)
      const parsedAnonymous = Number(anonymousDays)
      if (!Number.isInteger(parsedUser) || parsedUser < 0 || !Number.isInteger(parsedAnonymous) || parsedAnonymous < 0) {
        throw new Error('保留天数必须是非负整数')
      }
      await adminSetAnonymousSettings({ enabled: turnOn })
      await adminSetImageBedRetention({
        user_retention_days: parsedUser,
        anonymous_retention_days: parsedAnonymous,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-anon-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-image-bed-retention'] })
      onOpenChange(false)
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '保存失败'),
  })

  useEffect(() => {
    if (open) {
      setTurnOn(enabled)
      setUserDays(String(retention.data?.user_retention_days ?? 0))
      setAnonymousDays(String(retention.data?.anonymous_retention_days ?? 0))
      setErr('')
    }
  }, [open, enabled, retention.data])

  function onSubmit() {
    if (turnOn && !sourceKey) {
      setErr('请先在「站点服务」中为图床绑定存储源')
      return
    }
    mutation.mutate()
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
      <Field label="图床目标" hint="上传目标由「站点服务」中图床能力的绑定存储源决定">
        <span className={css.kvValue} style={{ fontFamily: vars.font.mono }}>
          {sourceKey || '未绑定（请先在站点服务中绑定）'}
        </span>
      </Field>
      <Field label="保留策略（天）" hint="0 表示不自动过期；达到保留期后图片直链与缩略图停止提供，历史记录保留供清理。">
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            登录用户
            <Input
              type="number"
              min="0"
              step="1"
              value={userDays}
              onChange={(event) => setUserDays(event.target.value)}
              aria-label="登录用户图片保留天数"
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            匿名上传
            <Input
              type="number"
              min="0"
              step="1"
              value={anonymousDays}
              onChange={(event) => setAnonymousDays(event.target.value)}
              aria-label="匿名图片保留天数"
            />
          </label>
        </div>
      </Field>
      {err && (
        <div style={{ fontSize: vars.fontSize.sm, color: vars.color.danger }}>
          {err}
        </div>
      )}
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

// --- 品牌信息（1.2.0）：实例名称，用于公开页/分享页品牌展示 ---

function BrandingSection() {
  const queryClient = useQueryClient()
  const branding = useQuery({ queryKey: ['admin-branding'], queryFn: adminGetBranding })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState('')

  const save = useMutation({
    mutationFn: () => adminSetBranding(name),
    onSuccess: async () => {
      setEditing(false)
      setMsg('')
      await queryClient.invalidateQueries({ queryKey: ['admin-branding'] })
      await queryClient.invalidateQueries({ queryKey: ['system-status'] })
    },
    onError: (error) => {
      setMsg(error instanceof ApiRequestError ? error.message : '保存失败，请重试。')
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim().length > 64) {
      setMsg('实例名称不能超过 64 个字符。')
      return
    }
    save.mutate()
  }

  const currentName = branding.data?.instance_name ?? 'OmniStore'

  return (
    <section className={css.section}>
      <header className={css.sectionHeaderWithAction}>
        <div className={css.sectionHeaderCopy}>
          <h2 id="branding-title" className={css.sectionTitle}>品牌信息</h2>
          <p className={css.sectionHint}>
            实例名称显示在公开页与分享页顶部及页脚；清空保存可恢复默认名称 OmniStore。
          </p>
        </div>
        <div className={css.sectionHeaderAction}>
          <Button
            onClick={() => {
              setName(currentName)
              setEditing((open) => !open)
              setMsg('')
            }}
          >
            {editing ? '取消' : '修改名称'}
          </Button>
        </div>
      </header>
      <div className={css.sectionBody}>
        {editing ? (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
            <Field label="实例名称" required error={msg} hint="1-64 个字符，展示于公开侧页面。">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="OmniStore" autoFocus />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? '保存中…' : '保存'}</Button>
            </div>
          </form>
        ) : (
          <div className={css.kvRow}>
            <span className={css.kvLabel}>实例名称</span>
            <span className={css.kvValue}>{branding.isPending ? '加载中…' : currentName}</span>
          </div>
        )}
      </div>
    </section>
  )
}

// --- 静态资源托管（2.0 AST）：单发布空间 + 固定公开标识 ---

const staticCacheModeLabels: Record<string, string> = {
  short: '短缓存（默认，5 分钟）',
  'no-cache': '协商缓存（使用前验证）',
  long: '长缓存（内容变化必须换 URL，需确认）',
}

const staticCorsModeLabels: Record<string, string> = {
  public: '公开跨域（ACAO: *，无凭据）',
  allowlist: '白名单（精确匹配 Origin）',
  none: '不添加 CORS 头',
}

function StaticAssetsSection() {
  const config = useQuery({ queryKey: ['static-assets-config'], queryFn: adminGetStaticConfig })
  if (config.isPending) {
    return (
      <section className={css.section}>
        <div className={css.sectionBody}><span className={css.kvLabel}>加载中…</span></div>
      </section>
    )
  }
  const data = config.data
  if (!data?.public_asset_id) {
    return <StaticAssetsConfigureForm />
  }
  return <StaticAssetsConfiguredView config={data} />
}

function StaticAssetsConfigureForm() {
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const [sourceKey, setSourceKey] = useState('')
  const [publishRoot, setPublishRoot] = useState('blog-assets')
  const [preflight, setPreflight] = useState<StaticAssetPreflight | null>(null)
  const [err, setErr] = useState('')

  const preflightMut = useMutation({
    mutationFn: () => adminPreflightStaticAssets({ source_key: sourceKey, publish_root: publishRoot }),
    onSuccess: (result) => { setPreflight(result); setErr('') },
    onError: (e) => { setErr(e instanceof ApiRequestError ? e.message : '预检失败'); setPreflight(null) },
  })
  const configureMut = useMutation({
    mutationFn: () => adminConfigureStaticAssets({
      source_key: sourceKey,
      publish_root: publishRoot.trim(),
      confirm_publish_root: publishRoot.trim() === '',
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['static-assets-config'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-capabilities'] })
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '配置失败'),
  })

  const usableSources = sources.data?.filter((source) => !source.is_disabled) ?? []
  return (
    <section className={css.section}>
      <header className={css.sectionHeaderWithAction}>
        <div className={css.sectionHeaderCopy}>
          <h2 className={css.sectionTitle}>静态资源托管</h2>
          <p className={css.sectionHint}>
            把一个普通目录按固定地址公开读取，用于博客图片、视频等长期资源。
            启用后发布目录内的受支持文件将公开读取，无需登录；不提供目录列表不等于保密。
          </p>
        </div>
      </header>
      <div className={css.sectionBody}>
        <Field label="发布存储源" required>
          <Select
            value={usableSources.some((source) => source.key === sourceKey)
              ? String(usableSources.findIndex((source) => source.key === sourceKey))
              : ''}
            onValueChange={(index) => setSourceKey(usableSources[Number(index)]?.key ?? '')}
            options={usableSources.map((source, index) => ({ value: String(index), label: source.name }))}
            placeholder="选择存储源…"
            ariaLabel="静态资源发布存储源"
          />
        </Field>
        <Field
          label="发布目录（源内相对路径）"
          hint={publishRoot.trim() === '' ? '留空表示发布整个存储源根目录，必须显式确认。' : '例如 blog-assets；托管命名空间与排除规则永远不公开。'}
        >
          <Input
            value={publishRoot}
            onChange={(event) => { setPublishRoot(event.target.value); setErr('') }}
            placeholder="blog-assets"
            aria-label="静态资源发布目录"
          />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" disabled={!sourceKey || preflightMut.isPending} onClick={() => preflightMut.mutate()}>
            {preflightMut.isPending ? '预检中…' : '预检发布目录'}
          </Button>
          <Button disabled={!sourceKey || configureMut.isPending} onClick={() => configureMut.mutate()}>
            {configureMut.isPending ? '保存中…' : '创建发布空间'}
          </Button>
        </div>
        {preflight && (
          <div className={css.sourcePreview}>
            <p>样例条目：{preflight.sample_entries.length > 0 ? preflight.sample_entries.join('、') : '（目录为空）'}</p>
            <p>公开类型：{preflight.supported_types.join('、')}</p>
            {preflight.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}
          </div>
        )}
        {err && <div style={{ fontSize: vars.fontSize.sm, color: vars.color.danger }}>{err}</div>}
      </div>
    </section>
  )
}

function StaticAssetsConfiguredView({ config }: { config: StaticAssetConfig }) {
  const queryClient = useQueryClient()
  const sources = useQuery({ queryKey: ['admin-sources'], queryFn: adminListSources })
  const [enabled, setEnabled] = useState(config.enabled)
  const [cacheMode, setCacheMode] = useState(config.cache_mode)
  const [corsMode, setCorsMode] = useState(config.cors_mode)
  const [publicOrigin, setPublicOrigin] = useState(config.public_origin)
  const [allowedOrigins, setAllowedOrigins] = useState(config.allowed_origins.join('\n'))
  const [rebindOpen, setRebindOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const saveMut = useMutation({
    mutationFn: () => adminUpdateStaticAssets({
      enabled,
      cache_mode: cacheMode,
      cors_mode: corsMode,
      public_origin: publicOrigin.trim(),
      allowed_origins: allowedOrigins.split('\n').map((origin) => origin.trim()).filter(Boolean),
      expected_revision: config.revision,
    }),
    onSuccess: async () => {
      setMsg('配置已保存；新响应按新策略执行。')
      await queryClient.invalidateQueries({ queryKey: ['static-assets-config'] })
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '保存失败'),
  })

  async function copyBaseURL() {
    await navigator.clipboard.writeText(config.base_url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <section className={css.section}>
        <header className={css.sectionHeaderWithAction}>
          <div className={css.sectionHeaderCopy}>
            <h2 className={css.sectionTitle}>静态资源托管</h2>
            <p className={css.sectionHint}>
              发布空间：{config.source_name} / {config.publish_root || '（存储源根目录）'}
            </p>
          </div>
          <div className={css.sectionHeaderAction}>
            <Button variant="secondary" onClick={() => setRebindOpen(true)}>更换发布空间</Button>
          </div>
        </header>
        <div className={css.sectionBody}>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>状态</span>
            <span className={css.kvValue}>
              {config.enabled ? <Badge color="green">公开读取中</Badge> : <Badge color="gray">已关闭（原站 404）</Badge>}
            </span>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>baseUrl</span>
            <span className={css.kvValue} style={{ fontFamily: vars.font.mono, wordBreak: 'break-all' }}>
              {config.base_url}
            </span>
            <Button variant="ghost" onClick={() => void copyBaseURL()}>{copied ? '已复制' : '复制'}</Button>
          </div>
          <div className={css.kvRow}>
            <span className={css.kvLabel}>公开类型</span>
            <span className={css.kvValue}>JPEG · PNG · GIF · WebP · MP4 · WebM（扩展名与服务端签名同时校验）</span>
          </div>
        </div>
      </section>

      <section className={css.section}>
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>缓存与跨域</h2>
        </div>
        <div className={css.sectionBody}>
          <Field label="启用" hint="关闭后原站公开读取返回 404；无法收回已分发到浏览器/CDN 的缓存。">
            <label className={fieldCss.checkboxRow}>
              <input type="checkbox" className={fieldCss.checkbox} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              提供公开读取
            </label>
          </Field>
          <Field label="缓存档位" hint="long 仅适合内容修改就更换 URL 的资源。">
            <Select
              value={cacheMode}
              onValueChange={(value) => setCacheMode(value as StaticAssetConfig['cache_mode'])}
              options={Object.entries(staticCacheModeLabels).map(([value, label]) => ({ value, label }))}
              ariaLabel="缓存档位"
            />
          </Field>
          <Field label="跨域档位" hint="CORS 不是图片保密机制；公开媒体可跨站嵌入。">
            <Select
              value={corsMode}
              onValueChange={(value) => setCorsMode(value as StaticAssetConfig['cors_mode'])}
              options={Object.entries(staticCorsModeLabels).map(([value, label]) => ({ value, label }))}
              ariaLabel="跨域档位"
            />
          </Field>
          <Field label="对外 origin（可选）" hint="只改变输出的 baseUrl；不自动配置 DNS/TLS/反向代理。">
            <Input
              value={publicOrigin}
              onChange={(event) => setPublicOrigin(event.target.value)}
              placeholder="https://files.example.com"
              aria-label="静态资源对外 origin"
            />
          </Field>
          {corsMode === 'allowlist' && (
            <Field label="允许的 Origin 白名单（每行一个完整 origin）" hint="精确匹配，不支持任意后缀。">
              <textarea className={fieldCss.textarea} value={allowedOrigins} onChange={(event) => setAllowedOrigins(event.target.value)} />
            </Field>
          )}
          <Button disabled={saveMut.isPending} onClick={() => { setMsg(''); setErr(''); saveMut.mutate() }}>
            {saveMut.isPending ? '保存中…' : '保存设置'}
          </Button>
          {msg && <div style={{ fontSize: vars.fontSize.sm, color: vars.color.textSecondary }}>{msg}</div>}
          {err && <div style={{ fontSize: vars.fontSize.sm, color: vars.color.danger }}>{err}</div>}
        </div>
      </section>

      <StaticAssetsRebindDialog
        open={rebindOpen}
        onOpenChange={setRebindOpen}
        config={config}
        sources={sources.data ?? []}
      />
    </>
  )
}

function StaticAssetsRebindDialog({
  open,
  onOpenChange,
  config,
  sources,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  config: StaticAssetConfig
  sources: AdminSource[]
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'reset' | 'relocate'>('reset')
  const [sourceKey, setSourceKey] = useState(config.source_key)
  const [publishRoot, setPublishRoot] = useState(config.publish_root)
  const [confirmRelocate, setConfirmRelocate] = useState(false)
  const [err, setErr] = useState('')

  const usable = sources.filter((source) => !source.is_disabled)
  const mutation = useMutation({
    mutationFn: () => adminRebindStaticAssets({
      source_key: sourceKey,
      publish_root: publishRoot.trim(),
      mode,
      confirm_publish_root: publishRoot.trim() === '',
      confirm_relocate: mode === 'relocate' ? confirmRelocate : undefined,
      expected_revision: config.revision,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['static-assets-config'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-capabilities'] })
      onOpenChange(false)
    },
    onError: (e) => setErr(e instanceof ApiRequestError ? e.message : '重绑失败'),
  })

  useEffect(() => {
    if (open) {
      setMode('reset')
      setSourceKey(config.source_key)
      setPublishRoot(config.publish_root)
      setConfirmRelocate(false)
      setErr('')
    }
  }, [open, config.source_key, config.publish_root])

  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title="更换发布空间"
      description="更换 source 或发布目录属于公开身份变更；普通保存无法完成此操作。"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={mutation.isPending || (mode === 'relocate' && !confirmRelocate)} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '执行中…' : '确认重绑'}
          </Button>
        </>
      }
    >
      <Field label="重绑模式">
        <Select
          value={mode}
          onValueChange={(value) => setMode(value as 'reset' | 'relocate')}
          options={[
            { value: 'reset', label: '重置：生成全新公开标识，旧 baseUrl 原站 404' },
            { value: 'relocate', label: '迁移保留：同一批内容迁移磁盘后保留标识' },
          ]}
          ariaLabel="重绑模式"
        />
      </Field>
      <Field label="新发布存储源">
        <Select
          value={usable.some((source) => source.key === sourceKey)
            ? String(usable.findIndex((source) => source.key === sourceKey))
            : ''}
          onValueChange={(index) => setSourceKey(usable[Number(index)]?.key ?? '')}
          options={usable.map((source, index) => ({ value: String(index), label: source.name }))}
          ariaLabel="重绑目标存储源"
        />
      </Field>
      <Field label="新发布目录" hint="留空表示存储源根目录（需在下一步确认）。">
        <Input value={publishRoot} onChange={(event) => setPublishRoot(event.target.value)} aria-label="重绑目标发布目录" />
      </Field>
      {mode === 'relocate' && (
        <Field label="迁移确认" required hint="勾选表示你已确认同一批内容已迁移/复制到新位置并核验，旧相对路径将继续有效。">
          <label className={fieldCss.checkboxRow}>
            <input
              type="checkbox"
              className={fieldCss.checkbox}
              checked={confirmRelocate}
              onChange={(e) => setConfirmRelocate(e.target.checked)}
            />
            我确认同一批内容已就位并核验，愿意承担核验责任（写入审计）
          </label>
        </Field>
      )}
      {err && <div style={{ fontSize: vars.fontSize.sm, color: vars.color.danger }}>{err}</div>}
    </DialogWrap>
  )
}
