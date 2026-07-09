import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { createFirstAdmin, fetchSetupStatus } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import * as css from './AuthForm.css'

// 初始化模式：数据库没有任何用户时创建第一个超级管理员（README §8.2）。
export function SetupPage() {
  const navigate = useNavigate()
  const status = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      await createFirstAdmin({ username, display_name: displayName, password })
      navigate({ to: '/login' })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '初始化失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (status.isPending) {
    return null
  }
  if (status.data?.initialized) {
    return (
      <div className={css.page}>
        <div className={css.card}>
          <h1 className={css.title}>OmniStore</h1>
          <p className={css.subtitle}>系统已初始化，初始化入口已关闭。</p>
          <p className={css.footer}>
            <a href="/login">前往登录</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={css.page}>
      <div className={css.card}>
        <h1 className={css.title}>初始化 OmniStore</h1>
        <p className={css.subtitle}>创建第一个超级管理员账号</p>
        <form className={css.form} onSubmit={onSubmit}>
          <Input
            label="用户名（创建后不可修改）"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="显示名"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="密码（至少 8 位）"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Input
            label="确认密码"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <p className={css.error}>{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? '创建中…' : '创建超级管理员'}
          </Button>
        </form>
      </div>
    </div>
  )
}
