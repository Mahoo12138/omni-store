import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminSetUserDisabled,
} from '../../api/admin'
import { fetchMe } from '../../api/auth'
import { ApiRequestError } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { formatDate } from '../../utils/format'
import { AdminLayout } from './AdminLayout'
import * as fm from '../FileManager.css'
import * as css from '../ImageBed.css'

// /admin/users：用户管理（README §7.2）。
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
    onSuccess: () => {
      setUsername('')
      setPassword('')
      setCreateErr('')
      refresh()
    },
    onError: (err) =>
      setCreateErr(err instanceof ApiRequestError ? err.message : '创建失败'),
  })

  const disableMut = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      adminSetUserDisabled(id, disabled),
    onSuccess: refresh,
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '操作失败'),
  })

  const deleteMut = useMutation({
    mutationFn: adminDeleteUser,
    onSuccess: refresh,
    onError: (err) => alert(err instanceof ApiRequestError ? err.message : '删除失败'),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    createMut.mutate({ username, display_name: username, password, role })
  }

  return (
    <AdminLayout title="用户管理">
      <section className={css.section}>
        <h2 className={css.sectionTitle}>创建用户</h2>
        <form onSubmit={onCreate}>
          <div className={css.row}>
            <Input
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="密码（至少 8 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <select className={css.select} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">普通用户</option>
              <option value="super_admin">超级管理员</option>
            </select>
            <Button type="submit" disabled={createMut.isPending}>
              创建
            </Button>
          </div>
          {createErr && <p className={css.error}>{createErr}</p>}
        </form>
      </section>

      <div className={fm.tableWrap}>
        <table className={fm.table}>
          <thead>
            <tr>
              <th className={fm.th}>用户名</th>
              <th className={fm.th}>显示名</th>
              <th className={fm.th}>角色</th>
              <th className={fm.th}>状态</th>
              <th className={fm.th}>创建时间</th>
              <th className={fm.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td className={fm.td}>{u.username}</td>
                <td className={fm.td}>{u.display_name}</td>
                <td className={fm.td}>{u.role === 'super_admin' ? '超级管理员' : '普通用户'}</td>
                <td className={fm.td}>{u.is_disabled ? '已禁用' : '正常'}</td>
                <td className={fm.td}>{formatDate(u.created_at)}</td>
                <td className={fm.td}>
                  {u.id !== me.data?.id && (
                    <>
                      <button
                        className={fm.actionBtn}
                        onClick={() => disableMut.mutate({ id: u.id, disabled: !u.is_disabled })}
                      >
                        {u.is_disabled ? '启用' : '禁用'}
                      </button>
                      <button
                        className={fm.actionBtnDanger}
                        onClick={() => {
                          if (confirm(`确定删除用户「${u.username}」吗？其 Token、权限和会话都会被清除。`)) {
                            deleteMut.mutate(u.id)
                          }
                        }}
                      >
                        删除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
