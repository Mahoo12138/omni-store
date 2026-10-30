import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { login } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { Banner } from '../components/shell/Banner'
import { FormField } from '../components/shell/FormLayout'
import { Input } from '@fluentui/react-components'
import { IconChevronRight, LogoMark } from '../components/ui/Icon'
import { AsciiTransfer } from '../components/login/AsciiTransfer'
import { useStyles } from './AuthForm.styles'
import { validateTransferSearch } from '../utils/transfer-workspace'

export function LoginPage() {
  const css = useStyles()
  const cardRef = useRef<HTMLDivElement>(null)
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
        await navigate({ to: '/transfer', search: validateTransferSearch(Object.fromEntries(redirect.searchParams)) })
      } else await navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '登录失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={css.page}>
      <AsciiTransfer className={css.canvas} anchorRef={cardRef} />
      <div className={css.card} ref={cardRef}>
        <div className={css.content}>
          <header className={css.brandRow}>
            <span className={css.brand}>
              <LogoMark size={28} />
              <span className={css.brandName}>OmniStore</span>
            </span>
            <span className={css.selfHosted}>SELF-HOSTED</span>
          </header>
          <div className={css.intro}>
            <h1 className={css.title}>登录到你的存储中心</h1>
            <p className={css.subtitle}>文件从客户端进入 OmniStore，再分发到你授权的通道。</p>
          </div>
          <form className={css.form} onSubmit={onSubmit}>
            <FormField label="用户名">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
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
            {error && <Banner intent="error">{error}</Banner>}
            <Button
              type="submit"
              className={css.submit}
              icon={<IconChevronRight size={16} />}
              iconPosition="after"
              disabled={submitting}
            >
              {submitting ? '登录中…' : '登录'}
            </Button>
          </form>
          <footer className={css.footer}>
            <a className={css.footerLink} href="/">返回公开网盘</a>
            <span className={css.footerMeta}>CLIENT → STORE → DELIVER</span>
          </footer>
        </div>
      </div>
    </main>
  )
}
