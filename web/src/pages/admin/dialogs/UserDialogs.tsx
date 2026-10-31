import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '../../../api/client'
import { adminCreateUser, adminSetUserQuota, type AdminUser } from '../../../api/admin'
import { Input } from '@fluentui/react-components'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { Banner } from '../../../components/shell/Banner'
import { FormField } from '../../../components/shell/FormLayout'
import { Select } from '../../../components/ui/Select'
import { formatBytes } from '../../../utils/format'
import { quotaGiBInputValue } from '../shared'

export function UserQuotaDialog({
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
      <FormField label="硬配额" hint="单位 GiB，填 0 表示不限制；只统计归属于该用户的文件。">
        <Input
          type="number"
          min="0"
          step="0.001"
          value={quotaGiB}
          onChange={(event) => setQuotaGiB(event.target.value)}
          aria-label="用户配额 GiB"
        />
      </FormField>
      {message ? <Banner intent="error">{message}</Banner> : null}
    </DialogWrap>
  )
}

export function CreateUserDialog({
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
      <FormField label="用户名" required hint="2-32 位字母数字下划线短横线">
        <Input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </FormField>
      <FormField label="显示名" hint="留空则使用用户名">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </FormField>
      <FormField
        label="密码"
        required
        error={err}
        hint="至少 8 位"
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>
      <FormField label="角色" required>
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
      </FormField>
    </DialogWrap>
  )
}
