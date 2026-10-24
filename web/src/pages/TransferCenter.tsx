import { useNavigate, useSearch } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { TransferWorkspace } from '../components/transfer/TransferWorkspace'
import * as css from './TransferCenter.css'

export function TransferCenterPage() {
  const search = useSearch({ from: '/app/transfer' })
  const navigate = useNavigate()
  return <AppShell title="流转中心">
    <header className={css.pageHeader}>
      <span className={css.pageEyebrow}>文件流转</span>
      <h1 className={css.pageTitle}>流转中心</h1>
      <p className={css.pageLead}>发送交付资料，或向他人收集文件。链接、权限与记录都集中在这里。</p>
    </header>
    <TransferWorkspace framed search={search} onNavigate={(next) => void navigate({ to: '/app/transfer', search: next })} />
  </AppShell>
}
