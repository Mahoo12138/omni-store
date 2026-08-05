import { useEffect, useMemo, useRef, useState } from 'react'
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
  adminGetSource,
  adminListPolicies,
  adminListSources,
  adminListUsers,
  adminPreflightSource,
  adminSetAnonymousSettings,
  adminSetExcludePatterns,
  adminSetSourceDisabled,
  adminSetUserDisabled,
  adminUpdateSource,
  adminUpdatePolicy,
  changePassword,
  fetchAdminOverview,
  updateProfile,
  type AdminSource,
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
  IconDownload,
  IconGlobe,
  IconImage,
  IconInfo,
  IconKey,
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
          {section === 'policies' && <PoliciesSection />}
          {section === 'users' && <UsersSection />}
          {section === 'audit' && <AuditSection />}
          {section === 'backup' && <BackupSection />}
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
          <p className={css.credentialsHint}>Token 与 Secret 仅在生成时展示一次，请妥善保存。</p>
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
          <ImageBedTokenManager />
          <S3CredentialManager />
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

function ImageBedTokenManager() {
  const queryClient = useQueryClient()
  const tokens = useQuery({ queryKey: ['image-bed-tokens'], queryFn: fetchImageBedTokens })
  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const [revealedToken, setRevealedToken] = useState('')
  const [revealOpen, setRevealOpen] = useState(false)
  const [deleting, setDeleting] = useState<ImageBedToken | null>(null)

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
    <article className={css.imageTokenGroup}>
      <div className={css.imageTokenHeader}>
        <div className={css.tokenIcon} aria-hidden="true"><IconKey size={17} /></div>
        <div className={css.tokenCopy}>
          <h3 className={css.tokenTitle}>图床 API</h3>
          <p className={css.tokenHint}>为不同 PicGo 或第三方客户端创建独立 Token，可单独撤销。</p>
        </div>
        <div className={css.tokenStatus}>
          {tokenItems.length > 0 ? (
            <span className={css.statusBadge}>
              <i className={css.statusDotSmall} />已启用 {tokenItems.length} 个
            </span>
          ) : (
            <span className={css.statusBadgeMuted}>未生成</span>
          )}
          <span className={css.lastUsed}>最多 10 个，明文仅显示一次</span>
        </div>
        <div className={css.tokenAction}>
          <Button
            variant="secondary"
            disabled={atLimit}
            title={atLimit ? '已达到 10 个 Token 上限' : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={14} />新建 Token
          </Button>
        </div>
      </div>

      <div className={css.imageTokenItems}>
        {tokens.isPending ? <div className={css.imageTokenEmpty}>正在加载…</div> : null}
        {tokens.isError ? <div className={css.imageTokenError}>Token 列表加载失败</div> : null}
        {tokens.isSuccess && tokenItems.length === 0 ? (
          <div className={css.imageTokenEmpty}>暂无图床 Token。为每台客户端创建独立凭据，撤销时不会影响其他客户端。</div>
        ) : null}
        {tokenItems.map((token) => (
          <div key={token.token_id} className={css.imageTokenItem}>
            <div className={css.imageTokenItemCopy}>
              <strong className={css.imageTokenLabel}>{token.label}</strong>
              <span className={css.imageTokenId}>{token.token_id}</span>
            </div>
            <div className={css.imageTokenDates}>
              <span>创建于 {formatDate(token.created_at)}</span>
              <span>{token.last_used_at ? `最近使用 ${formatDate(token.last_used_at)}` : '从未使用'}</span>
            </div>
            <Button variant="ghost" onClick={() => setDeleting(token)} aria-label={`撤销 ${token.label}`}>
              <IconTrash size={15} />撤销
            </Button>
          </div>
        ))}
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
        <Field label="Token">
          <div className={css.tokenRevealRow}>
            <Input readOnly value={revealedToken} />
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
    </article>
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

  return (
    <article className={css.imageTokenGroup}>
      <div className={css.imageTokenHeader}>
        <div className={css.tokenIcon} aria-hidden="true"><IconKey size={17} /></div>
        <div className={css.tokenCopy}>
          <h3 className={css.tokenTitle}>S3 Access Key</h3>
          <p className={css.tokenHint}>供 AWS CLI、rclone 等客户端通过专用 S3 端口访问已授权存储源。</p>
        </div>
        <div className={css.tokenStatus}>
          {enabledCount > 0 ? (
            <span className={css.statusBadge}><i className={css.statusDotSmall} />已启用 {enabledCount} 个</span>
          ) : items.length > 0 ? (
            <span className={css.statusBadgeMuted}>{items.length} 个已禁用</span>
          ) : (
            <span className={css.statusBadgeMuted}>未生成</span>
          )}
          <span className={css.lastUsed}>最多 10 个，Secret 仅显示一次</span>
        </div>
        <div className={css.tokenAction}>
          <Button
            variant="secondary"
            disabled={atLimit}
            title={atLimit ? '已达到 10 个凭据上限' : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus size={14} />新建凭据
          </Button>
        </div>
      </div>

      <div className={css.imageTokenItems}>
        {credentials.isPending ? <div className={css.imageTokenEmpty}>正在加载…</div> : null}
        {credentials.isError ? <div className={css.imageTokenError}>S3 凭据列表加载失败</div> : null}
        {credentials.isSuccess && items.length === 0 ? (
          <div className={css.imageTokenEmpty}>暂无 S3 凭据。建议为每台客户端创建独立 Access Key。</div>
        ) : null}
        {items.map((credential) => (
          <div key={credential.access_key_id} className={css.imageTokenItem}>
            <div className={css.imageTokenItemCopy}>
              <strong className={css.imageTokenLabel}>{credential.name}</strong>
              <span className={css.imageTokenId}>{credential.access_key_id}</span>
            </div>
            <div className={css.imageTokenDates}>
              <span>{credential.is_disabled ? '已禁用' : `创建于 ${formatDate(credential.created_at)}`}</span>
              <span>{credential.last_used_at ? `最近使用 ${formatDate(credential.last_used_at)}` : '从未使用'}</span>
            </div>
            <div className={css.s3CredentialActions}>
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
              <Button variant="ghost" onClick={() => setDeleting(credential)} aria-label={`撤销 ${credential.name}`}>
                <IconTrash size={15} />撤销
              </Button>
            </div>
          </div>
        ))}
        {sources.isSuccess && sources.data.length > 0 ? (
          <>
            <div className={css.imageTokenEmpty}>
              S3 客户端中的 Bucket 由系统生成；请按存储源名称复制对应值。
            </div>
            {sources.data.map((source) => (
              <div key={source.key} className={css.imageTokenItem}>
                <div className={css.imageTokenItemCopy}>
                  <strong className={css.imageTokenLabel}>{source.name}</strong>
                  <span className={css.imageTokenId}>{source.key}</span>
                </div>
                <div className={css.s3CredentialActions}>
                  <Button variant="ghost" onClick={() => navigator.clipboard.writeText(source.key)}>
                    复制 Bucket
                  </Button>
                </div>
              </div>
            ))}
          </>
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
        <Field label="Access Key ID">
          <div className={css.tokenRevealRow}>
            <Input readOnly value={revealed?.accessKeyId ?? ''} />
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealed?.accessKeyId ?? '')}>复制</Button>
          </div>
        </Field>
        <Field label="Secret Access Key">
          <div className={css.tokenRevealRow}>
            <Input readOnly value={revealed?.secret ?? ''} />
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
    </article>
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
                <th className={css.compactTh}>真实路径</th>
                <th className={css.compactTh}>公开</th>
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
                <th className={css.compactTh}>名称</th>
                <th className={css.compactTh}>路径</th>
                <th className={css.compactTh}>状态</th>
                <th className={css.compactTh}>配额</th>
                <th className={css.compactTh}>公开</th>
                <th className={css.compactTh}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.data?.map((s) => (
                <tr key={s.key} className={css.compactTr}>
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
                    {s.quota_bytes > 0 ? formatBytes(s.quota_bytes) : '不限'}
                  </td>
                  <td className={css.compactTd}>
                    {s.public_read_enabled ? <Badge color="green">公开</Badge> : '—'}
                  </td>
                  <td className={css.compactTd}>
                    <div className={css.formRow}>
                      <Button variant="ghost" onClick={() => setEditId(s.key)}>
                        配置
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => disableMut.mutate({ id: s.key, disabled: !s.is_disabled })}
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
                {createMutation.isPending ? '创建中…' : '确认创建'}
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

// --- 编辑存储源 弹窗（WebDAV/图床/公开访问 + 排除规则）---

function EditSourceDialog({
  sourceKey,
  onClose,
}: {
  sourceKey: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['admin-source', sourceKey], queryFn: () => adminGetSource(sourceKey) })

  const [mountPath, setMountPath] = useState<string | null>(null)
  const [patterns, setPatterns] = useState<string | null>(null)
  const [publicOn, setPublicOn] = useState<boolean | null>(null)
  const [webdavOn, setWebdavOn] = useState<boolean | null>(null)
  const [imageBedOn, setImageBedOn] = useState<boolean | null>(null)
  const [quotaGiB, setQuotaGiB] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  // 打开弹窗时，把当前值同步到本地 state
  useEffect(() => {
    if (detail.isSuccess) {
      setMountPath(detail.data.source.public_mount_path ?? '')
      setPatterns(detail.data.exclude_patterns.join('\n'))
      setPublicOn(detail.data.source.public_read_enabled)
      setWebdavOn(detail.data.source.webdav_enabled)
      setImageBedOn(detail.data.source.image_bed_enabled)
      setQuotaGiB(detail.data.source.quota_bytes > 0
        ? String(detail.data.source.quota_bytes / (1024 ** 3))
        : '0')
    }
  }, [detail.isSuccess, detail.data])

  const updateMut = useMutation({
    mutationFn: (input: Parameters<typeof adminUpdateSource>[1]) => adminUpdateSource(sourceKey, input),
    onSuccess: () => { setMsg('已保存'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  const patternsMut = useMutation({
    mutationFn: (list: string[]) => adminSetExcludePatterns(sourceKey, list),
    onSuccess: () => { setMsg('排除规则已保存'); refresh() },
    onError: (err) => setMsg(err instanceof ApiRequestError ? err.message : '保存失败'),
  })
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-source', sourceKey] })
    queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
  }

  if (!detail.isSuccess) return null
  const src: AdminSource = detail.data.source
  const mountValue = mountPath ?? src.public_mount_path ?? ''
  const patternsValue = patterns ?? detail.data.exclude_patterns.join('\n')
  const quotaValue = quotaGiB ?? (src.quota_bytes > 0 ? String(src.quota_bytes / (1024 ** 3)) : '0')

  return (
    <DialogWrap
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title={`配置：${src.name}`}
      description={`真实路径：${src.root_path}`}
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
        label="存储源硬配额"
        hint={`当前已使用 ${formatBytes(detail.data.quota.usage_bytes)}；填 0 表示不限制。配额不会删除已有文件。`}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={quotaValue}
            onChange={(event) => setQuotaGiB(event.target.value)}
            aria-label="存储源配额 GiB"
          />
          <span style={{ color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>GiB</span>
          <Button
            variant="secondary"
            disabled={updateMut.isPending || Number(quotaValue) < 0 || !Number.isFinite(Number(quotaValue))}
            onClick={() => updateMut.mutate({ quota_bytes: Math.round(Number(quotaValue) * 1024 ** 3) })}
          >
            保存配额
          </Button>
        </div>
      </Field>

      <Field
        label="公开挂载路径"
        hint="如 /photos，修改后旧链接会自动重定向到新路径"
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
        <div className={css.sectionHeader}>
          <h2 className={css.sectionTitle}>访问策略</h2>
          <p className={css.sectionHint}>
            将多个存储源权限组合成策略，再统一绑定用户；多策略重叠时自动采用更高权限。
          </p>
        </div>
        <div className={css.sectionBody}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <span style={{ color: vars.color.textSecondary, fontSize: vars.fontSize.sm }}>
              共 {policies.data?.length ?? 0} 个策略
            </span>
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus size={14} /> 新建策略
            </Button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={css.compactTable}>
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
        </div>
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
                    目标存储源：{imageBedSources.find((source) => source.key === settings.data.key)?.name ?? '未配置'}
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
        sourceKey={settings.data.key}
        imageBedSources={imageBedSources}
      />
    </>
  )
}

function AnonymousImageBedDialog({
  open,
  onOpenChange,
  enabled,
  sourceKey,
  imageBedSources,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  enabled: boolean
  sourceKey: string
  imageBedSources: { key: string; name: string }[]
}) {
  const queryClient = useQueryClient()
  const [pickSource, setPickSource] = useState(sourceKey)
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
      setPickSource(sourceKey)
      setTurnOn(enabled)
      setErr('')
    }
  }, [open, sourceKey, enabled])

  function onSubmit() {
    if (turnOn && !pickSource) {
      setErr('请选择目标存储源')
      return
    }
    mutation.mutate({ enabled: turnOn, key: pickSource })
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
          value={imageBedSources.some((source) => source.key === pickSource)
            ? String(imageBedSources.findIndex((source) => source.key === pickSource))
            : ''}
          onValueChange={(index) => setPickSource(imageBedSources[Number(index)]?.key ?? '')}
          options={imageBedSources.map((source, index) => ({
            value: String(index),
            label: source.name,
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
