import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminCreateSource, adminCreateUser, fetchAdminOverview } from '../../api/admin'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  IconActivity,
  IconArrowUp,
  IconGlobe,
  IconImage,
  IconPlus,
  IconServer,
  IconUser,
  IconUserPlus,
} from '../../components/ui/Icon'
import { vars } from '../../styles/theme.css'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import * as css from './AdminOverview.css'
import * as ib from '../ImageBed.css'

// 管理后台概览（docs/admin.png）：统计 + 存储源 + 系统状态 + 用户与权限 + 最近审计。
export function AdminOverviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: fetchAdminOverview,
    refetchInterval: 30_000,
  })

  const [showCreateSource, setShowCreateSource] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)

  const o = overview.data

  return (
    <AdminLayout>
      <AdminPageHeader
        title="管理后台"
        actions={
          <>
            <Button variant="primary" onClick={() => setShowCreateSource(true)}>
              <IconPlus size={16} /> 新建存储源
            </Button>
            <Button variant="secondary" onClick={() => setShowCreateUser(true)}>
              <IconUserPlus size={16} /> 创建用户
            </Button>
          </>
        }
      />

      {/* 顶部 4 个统计卡 */}
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

      {/* 双列布局：左=存储源+用户与权限；右=系统状态+最近审计 */}
      <div className={css.grid2}>
        {/* 左列 */}
        <div>
          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h2 className={css.panelTitle}>存储源概览</h2>
              <Button variant="ghost" onClick={() => navigate({ to: '/admin/sources' })}>
                管理 →
              </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className={css.compactTable}>
                <thead>
                  <tr>
                    <th className={css.compactTh}>名称</th>
                    <th className={css.compactTh}>Source ID</th>
                    <th className={css.compactTh}>真实路径</th>
                    <th className={css.compactTh}>公开挂载</th>
                    <th className={css.compactTh}>WebDAV</th>
                    <th className={css.compactTh}>图床</th>
                    <th className={css.compactTh}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.isPending && (
                    <tr>
                      <td colSpan={7} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        加载中…
                      </td>
                    </tr>
                  )}
                  {o?.sources.length === 0 && (
                    <tr>
                      <td colSpan={7} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        还没有存储源，点击右上角"新建存储源"开始。
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
                        {s.public_mount_path ? <MonoText>{s.public_mount_path}</MonoText> : <span style={{ color: vars.color.textSecondary }}>—</span>}
                      </td>
                      <td className={css.compactTd}>
                        <EnabledPill on={s.webdav_enabled} />
                      </td>
                      <td className={css.compactTd}>
                        <EnabledPill on={s.image_bed_enabled} />
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

          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h2 className={css.panelTitle}>用户与权限</h2>
              <Button variant="ghost" onClick={() => navigate({ to: '/admin/users' })}>
                管理 →
              </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className={css.compactTable}>
                <thead>
                  <tr>
                    <th className={css.compactTh}>用户名</th>
                    <th className={css.compactTh}>角色</th>
                    <th className={css.compactTh}>存储源权限数</th>
                    <th className={css.compactTh}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.isPending && (
                    <tr>
                      <td colSpan={4} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        加载中…
                      </td>
                    </tr>
                  )}
                  {o?.users.length === 0 && (
                    <tr>
                      <td colSpan={4} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        还没有用户。
                      </td>
                    </tr>
                  )}
                  {o?.users.map((u) => (
                    <tr key={u.id} className={css.compactTr}>
                      <td className={css.compactTd} style={{ fontWeight: 500 }}>{u.username}</td>
                      <td className={css.compactTd}>
                        {u.role === 'super_admin' ? '超级管理员' : '普通用户'}
                      </td>
                      <td className={css.compactTd}>
                        {u.permission_all ? '全部' : `${u.permission_count} 个`}
                      </td>
                      <td className={css.compactTd}>
                        <Badge color={u.is_disabled ? 'gray' : 'green'}>
                          {u.is_disabled ? '已禁用' : '正常'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 右列 */}
        <div>
          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h2 className={css.panelTitle}>系统状态</h2>
            </div>
            <div className={css.statusList}>
              <span className={css.statusLabel}>运行版本</span>
              <span className={css.statusValue}>{o?.system.version ?? '—'}</span>

              <span className={css.statusLabel}>数据目录</span>
              <span className={css.statusValue}>
                <MonoText>{o?.system.data_dir ?? '—'}</MonoText>
              </span>

              <span className={css.statusLabel}>配置方式</span>
              <span className={css.statusValue}>YAML + 环境变量</span>

              <span className={css.statusLabel}>主服务端口</span>
              <span className={css.statusValue}>
                <MonoText>{portOf(o?.system.http_addr) ?? '—'}</MonoText>
              </span>

              <span className={css.statusLabel}>S3 状态</span>
              <span className={css.statusValue}>
                <StatusDot color={o?.system.s3_enabled ? vars.color.success : vars.color.textSecondary} />
                {o?.system.s3_status ?? '—'}
              </span>

              <span className={css.statusLabel}>WebDAV 状态</span>
              <span className={css.statusValue}>
                <StatusDot color={vars.color.success} />
                {o?.system.webdav_status ?? '—'}
              </span>
            </div>
          </section>

          <section className={css.panel}>
            <div className={css.panelHeader}>
              <h2 className={css.panelTitle}>
                <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4, color: vars.color.textSecondary }}>
                  <IconActivity size={15} />
                </span>
                最近审计日志
              </h2>
              <Button variant="ghost" onClick={() => navigate({ to: '/admin/audit-logs' })}>
                查看全部 →
              </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className={css.compactTable}>
                <thead>
                  <tr>
                    <th className={css.compactTh}>时间</th>
                    <th className={css.compactTh}>操作者</th>
                    <th className={css.compactTh}>动作</th>
                    <th className={css.compactTh}>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.isPending && (
                    <tr>
                      <td colSpan={4} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        加载中…
                      </td>
                    </tr>
                  )}
                  {o?.recent_audits.length === 0 && (
                    <tr>
                      <td colSpan={4} className={css.compactTd} style={{ color: vars.color.textSecondary }}>
                        暂无日志
                      </td>
                    </tr>
                  )}
                  {o?.recent_audits.map((a) => (
                    <tr key={a.id} className={css.compactTr}>
                      <td className={css.compactTd} style={{ color: vars.color.textSecondary, fontFamily: vars.font.mono, whiteSpace: 'nowrap' }}>
                        {a.created_at}
                      </td>
                      <td className={css.compactTd} style={{ fontWeight: 500 }}>
                        {a.actor_name}
                      </td>
                      <td className={css.compactTd}>{a.title}</td>
                      <td className={css.compactTd}>
                        <Badge color={a.status === 'success' ? 'green' : 'red'}>
                          {a.status === 'success' ? '成功' : '失败'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* 弹层：快速创建 */}
      {showCreateSource && (
        <CreateSourceModal
          onClose={() => setShowCreateSource(false)}
          onCreated={() => {
            setShowCreateSource(false)
            queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
            queryClient.invalidateQueries({ queryKey: ['admin-sources'] })
          }}
        />
      )}
      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={() => {
            setShowCreateUser(false)
            queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
            queryClient.invalidateQueries({ queryKey: ['admin-users'] })
          }}
        />
      )}
    </AdminLayout>
  )
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

function MonoText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: vars.font.mono, color: vars.color.textSecondary }}>
      {children}
    </span>
  )
}

function StatusDot({ color }: { color: string }) {
  return <span className={css.statusDot} style={{ background: color }} />
}

function EnabledPill({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: vars.fontSize.xs,
        fontWeight: 500,
        color: on ? vars.color.success : vars.color.textSecondary,
        backgroundColor: on ? vars.color.successSubtle : vars.color.surfaceHover,
        borderRadius: vars.radius.full,
      }}
    >
      {on ? '开启' : '关闭'}
    </span>
  )
}

function portOf(addr?: string): string | undefined {
  if (!addr) return undefined
  const i = addr.lastIndexOf(':')
  return i >= 0 ? addr.slice(i + 1) : addr
}

// --- 弹层：新建存储源 ---

function CreateSourceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [sourceId, setSourceId] = useState('')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setErr('')
    setBusy(true)
    try {
      await adminCreateSource({
        source_id: sourceId.trim(),
        name: name.trim() || sourceId.trim(),
        description: '',
        root_path: rootPath.trim(),
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="新建存储源" onClose={onClose}>
      <div className={ib.row}>
        <Input
          label="Source ID（小写字母数字短横线）"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          required
        />
        <Input
          label="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：照片盘"
        />
      </div>
      <div className={ib.row}>
        <Input
          label="真实目录绝对路径"
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          required
          placeholder="/mnt/sources/photos"
        />
      </div>
      {err && <p className={ib.error}>{err}</p>}
      <p className={ib.label} style={{ marginTop: 8 }}>
        路径创建后不可修改，且不能是系统目录、数据目录或重叠挂载。
      </p>
      <div className={ib.row} style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={busy || !sourceId || !rootPath}
        >
          {busy ? '创建中…' : '创建'}
        </Button>
      </div>
    </ModalShell>
  )
}

// --- 弹层：创建用户 ---

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setErr('')
    setBusy(true)
    try {
      await adminCreateUser({
        username: username.trim(),
        display_name: username.trim(),
        password,
        role,
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="创建用户" onClose={onClose}>
      <div className={ib.row}>
        <Input
          label="用户名（3-32 位字母/数字/下划线/短横线）"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          label="密码（至少 8 位）"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className={ib.row}>
        <label className={ib.label}>
          角色：{' '}
          <select
            className={ib.select}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="user">普通用户</option>
            <option value="super_admin">超级管理员</option>
          </select>
        </label>
      </div>
      {err && <p className={ib.error}>{err}</p>}
      <div className={ib.row} style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={busy || !username || !password}
        >
          {busy ? '创建中…' : '创建'}
        </Button>
      </div>
    </ModalShell>
  )
}

// 简易 Modal 容器
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className={ib.section}
        style={{ width: 480, maxWidth: '100%', marginBottom: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={ib.sectionTitle}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
