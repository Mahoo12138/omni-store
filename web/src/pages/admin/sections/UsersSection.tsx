import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../../../api/client'
import { adminDeleteUser, adminListUsers, adminRevokeUserCredentials, adminSetUserDisabled, type AdminUser } from '../../../api/admin'
import { fetchMe, type User } from '../../../api/auth'
import { mergeClasses, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { StateView } from '../../../components/shell/StateView'
import { Menu } from '../../../components/ui/Menu'
import { IconAction } from '../../../components/ui/IconAction'
import { IconGauge, IconMore, IconTrash, IconUser, IconUserPlus } from '../../../components/ui/Icon'
import { formatBytes, formatDate } from '../../../utils/format'
import { useStyles } from './users.styles'
import { CreateUserDialog, UserQuotaDialog } from '../dialogs/UserDialogs'
import { HorizontalDataRegion } from '../shared'
import { SectionCard } from '../SectionCard'

export function UsersSection() {
  const css = useStyles()
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
      <SectionCard
        icon={<IconUser size={18} />}
        tone="brand"
        hint={<>共 {users.data?.length ?? 0} 个</>}
        actions={<Button onClick={() => setCreateOpen(true)} icon={<IconUserPlus size={14} />}>创建用户</Button>}
        bodyPadding="none"
      >
        <HorizontalDataRegion name="用户">
          <Table size="small" className={mergeClasses(css.compactTable, css.compactTableWide)}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={css.compactTh}>用户名</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>显示名</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>角色</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>状态</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>用量 / 配额</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>创建时间</TableHeaderCell>
                <TableHeaderCell className={css.compactTh}>操作</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id} className={css.compactTr}>
                  <TableCell className={css.compactTd} style={{ fontWeight: 500 }}>{u.username}</TableCell>
                  <TableCell className={css.compactTd}>{u.display_name}</TableCell>
                  <TableCell className={css.compactTd}>
                    <Badge color={u.role === 'super_admin' ? 'blue' : 'gray'}>
                      {u.role === 'super_admin' ? '管理员' : '用户'}
                    </Badge>
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    <Badge color={u.is_disabled ? 'gray' : 'green'}>
                      {u.is_disabled ? '已禁用' : '正常'}
                    </Badge>
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    {formatBytes(u.usage_bytes)} / {u.quota_bytes > 0 ? formatBytes(u.quota_bytes) : '不限'}
                  </TableCell>
                  <TableCell className={css.compactTd} style={{ color: 'var(--colorNeutralForeground2)' }}>
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell className={css.compactTd}>
                    {u.id !== me.data?.id ? (
                      <div className={css.formRow}>
                        {/* 高频、无风险的操作留在行内；其余收进行尾「更多」菜单。 */}
                        <IconAction label="调整配额" icon={<IconGauge size={16} />} onClick={() => setQuotaEditing(u)} />
                        <Menu
                          ariaLabel={`用户 ${u.username} 的更多操作`}
                          triggerTitle="更多操作"
                          trigger={<IconMore size={16} />}
                          triggerClassName={css.rowMenuTrigger}
                          items={[
                            {
                              id: 'toggle',
                              label: u.is_disabled ? '启用用户' : '禁用用户',
                              disabled: disableMut.isPending,
                              onSelect: () => disableMut.mutate({ id: u.id, disabled: !u.is_disabled }),
                            },
                            {
                              id: 'revoke',
                              label: '撤销访问凭据',
                              onSelect: () => setRevokingCredentials(u),
                            },
                            {
                              id: 'delete',
                              label: '删除用户',
                              icon: <IconTrash size={14} />,
                              danger: true,
                              dividerBefore: true,
                              onSelect: () => setDeleting(u),
                            },
                          ]}
                        />
                      </div>
                    ) : (
                      <div className={css.formRow}>
                        <IconAction label="调整配额" icon={<IconGauge size={16} />} onClick={() => setQuotaEditing(u)} />
                        <span className={css.kvLabel}>（当前用户）</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.isSuccess && users.data.length === 0 && (
            <StateView layout="plain" kind="empty" title="还没有用户" />
          )}
        </HorizontalDataRegion>
      </SectionCard>

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
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--colorNeutralForeground1)' }}>
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
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--colorNeutralForeground1)' }}>
          该用户的 Token、授权关系与会话都会被清除。该操作不可撤销。
        </p>
      </DialogWrap>
    </>
  )
}

