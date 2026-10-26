import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { login } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/shell/FormLayout'
import { Input } from '@fluentui/react-components'
import { LogoMark } from '../components/ui/Icon'
import { useStyles } from './AuthForm.styles'
import { validateTransferSearch } from '../utils/transfer-workspace'

export function LoginPage() {
  const css = useStyles()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(username, password)
      queryClient.removeQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('transfer-') })
      queryClient.setQueryData(['me'], user)
      queryClient.setQueryData(['auth-status'], { authenticated: true })
      if (search.redirect) {
        const redirect = new URL(search.redirect, window.location.origin)
        await navigate({ to: redirect.pathname === '/transfer' ? '/transfer' : '/app/transfer', search: validateTransferSearch(Object.fromEntries(redirect.searchParams)) })
      } else await navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '登录失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={css.page}>
      <div className={css.card}>
        <div className={css.brand}>
          <LogoMark size={32} />
          <span className={css.brandName}>OmniStore</span>
        </div>
        <p className={css.subtitle}>登录到你的存储中心</p>
        <form className={css.form} onSubmit={onSubmit}>
          <FormField label="用户名">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </FormField>
          <FormField label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </FormField>
          {error && <p className={css.error}>{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>
        <p className={css.footer}>
          <a href="/">返回公开网盘</a>
        </p>
      </div>
    </div>
  )
}
