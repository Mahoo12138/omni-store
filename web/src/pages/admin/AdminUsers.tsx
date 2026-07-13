import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminCreateUser, adminDeleteUser, adminListUsers, adminSetUserDisabled } from '../../api/admin'
import { fetchMe } from '../../api/auth'
import { ApiRequestError } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { IconTrash } from '../../components/ui/Icon'
import { formatDate } from '../../utils/format'
import { AdminLayout, AdminPageHeader } from './AdminLayout'
import * as ft from '../../components/files/FileTable.css'
import * as ib from '../ImageBed.css'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [createErr, setCreateErr] = useState('')

  const createMut = useMutation({
    mutationFn: adminCreateUser,
    onSuccess: () => { setUsername(''); setPassword(''); setCreateErr(''); refresh() },
    onError: (err) => setCreateErr(err instanceof ApiRequestError ? err.message : '创建失败'),
  })

  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) => adminSetUserDisabled(id, disabled),
    onSuccess: refresh, onError: (err) => alert(err instanceof ApiRequestError ? err.message : '操作失败'),
  })

  const deleteMut = useMutation({
    mutationFn: adminDeleteUser, onSuccess: refresh, onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    createMut.mutate({ username, display_name: username, password, role })
  }

  return (
    <AdminLayout>
      <AdminPageHeader title="用户" />
      <section className={ib.section}>
        <h2 className={ib.sectionTitle}>创建用户</h2>
        <form onSubmit={onCreate}>
          <div className={ib.row}>
            <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Input type="password" placeholder="密码（至少 8 位）" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            <select className={ib.select} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">普通用户</option>
              <option value="super_admin">超级管理员</option>
            </select>
            <Button type="submit" disabled={createMut.isPending}>创建</Button>
          </div>
          {createErr && <p className={ib.error}>{createErr}</p>}
        </form>
      </section>

      <div className={ft.tableWrap}>
        <table className={ft.table}>
          <thead>
            <tr>
              <th className={ft.th}>用户名</th>
              <th className={ft.th}>显示名</th>
              <th className={ft.th}>角色</th>
              <th className={ft.th}>状态</th>
              <th className={ft.th}>创建时间</th>
              <th className={ft.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className={ft.row}>
                <td className={ft.td}>{u.username}</td>
                <td className={ft.td}>{u.display_name}</td>
                <td className={ft.td}><Badge color={u.role === 'super_admin' ? 'blue' : 'gray'}>{u.role === 'super_admin' ? '管理员' : '用户'}</Badge></td>
                <td className={ft.td}><Badge color={u.is_disabled ? 'gray' : 'green'}>{u.is_disabled ? '已禁用' : '正常'}</Badge></td>
                <td className={ft.td}>{formatDate(u.created_at)}</td>
                <td className={ft.td}>
                  {u.id !== me.data?.id && (
                    <span className={ft.actions}>
                      <button className={ft.actionBtn} onClick={() => disableMut.mutate({ id: u.id, disabled: !u.is_disabled })}>
                        {u.is_disabled ? '启用' : '禁用'}
                      </button>
                      <button className={ft.actionBtnDanger} onClick={() => {
                        if (confirm(`确定删除用户「${u.username}」吗？其 Token、权限和会话都会被清除。`)) deleteMut.mutate(u.id)
                      }}>
                        <IconTrash size={15} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.isSuccess && users.data.length === 0 && <div className={ft.empty}>还没有用户</div>}
      </div>
    </AdminLayout>
  )
}
