import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemStatus } from '../../api/system'
import { PublicShell } from '../layout/PublicShell'
import { PublicNavigation } from '../layout/PublicNavigation'
import { LogoMark } from '../ui/Icon'
import * as css from './PublicTransferShell.css'

export function PublicTransferShell({ title, description, summary, children }: {
  title: string
  description?: string
  summary?: ReactNode
  children: ReactNode
}) {
  const system = useQuery({ queryKey: ['system-status'], queryFn: fetchSystemStatus, retry: false, staleTime: 60_000 })
  const instanceName = system.data?.instance_name?.trim() || 'OmniStore'
  return (
    <PublicShell showHeader={false}>
      <div className={css.page}>
        <section className={css.hero} aria-labelledby="transfer-title">
          <div className={css.masthead}>
            <Link to="/" className={css.brand} aria-label={`返回 ${instanceName} 公开网盘`}>
              <span className={css.brandLogo} aria-hidden="true"><LogoMark size={32} /></span>
              <span className={css.brandCopy}><strong className={css.brandName}>{instanceName}</strong><small>FILE TRANSFER</small></span>
            </Link>
            <PublicNavigation />
          </div>
          <div className={css.heroBody}>
            <div className={css.heroCopy}><h1 id="transfer-title">{title}</h1>{description ? <p>{description}</p> : null}</div>
            {summary}
          </div>
        </section>
        <div className={css.stage}><div className={css.workbench}>{children}</div></div>
      </div>
    </PublicShell>
  )
}
