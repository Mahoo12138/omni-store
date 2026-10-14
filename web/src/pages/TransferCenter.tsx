import { useNavigate, useSearch } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { TransferWorkspace } from '../components/transfer/TransferWorkspace'
import * as css from './TransferCenter.css'

export function TransferCenterPage() {
  const search = useSearch({ from: '/app/transfer' })
  const navigate = useNavigate()
  return <AppShell title="流转中心">
    <div className={css.pageHeader}><h1 className={css.pageTitle}>流转中心</h1></div>
    <TransferWorkspace search={search} onNavigate={(next) => void navigate({ to: '/app/transfer', search: next })} />
  </AppShell>
}
