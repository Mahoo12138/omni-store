import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { createFirstAdmin, fetchSetupStatus } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/shell/FormLayout'
import { Input } from '@fluentui/react-components'
import { LogoMark } from '../components/ui/Icon'
import { useStyles } from './AuthForm.styles'

export function SetupPage() {
  const css = useStyles()
  const navigate = useNavigate()
  const status = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus })

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
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
      await createFirstAdmin({ username, display_name: displayName, password, bootstrap_token: bootstrapToken })
      navigate({ to: '/login' })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '初始化失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (status.isPending) return null
  if (status.data?.initialized) {
    return (
      <div className={css.page}>
        <div className={css.card}>
          <div className={css.brand}>
            <LogoMark size={32} />
            <span className={css.brandName}>OmniStore</span>
          </div>
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
        <div className={css.brand}>
          <LogoMark size={32} />
          <span className={css.brandName}>OmniStore</span>
        </div>
        <p className={css.subtitle}>创建第一个超级管理员账号</p>
        <form className={css.form} onSubmit={onSubmit}>
          <FormField label="初始化凭据" hint="从首次启动日志读取，或使用 OMNISTORE_BOOTSTRAP_TOKEN 预先配置。">
            <Input
              type="password"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
              autoComplete="off"
              required
            />
          </FormField>
          <FormField label="用户名（创建后不可修改）">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </FormField>
          <FormField label="显示名">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </FormField>
          <FormField label="密码（至少 8 位）">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
          <FormField label="确认密码">
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </FormField>
          {error && <p className={css.error}>{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? '创建中…' : '创建超级管理员'}
          </Button>
        </form>
      </div>
    </div>
  )
}
