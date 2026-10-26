import { useNavigate, useSearch } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { PageHeader } from '../components/shell/PageHeader'
import { TransferWorkspace } from '../components/transfer/TransferWorkspace'

export function TransferCenterPage() {
  const search = useSearch({ from: '/app/transfer' })
  const navigate = useNavigate()
  return <AppShell title="流转中心">
    <PageHeader
      eyebrow="文件流转"
      title="流转中心"
      description="发送交付资料，或向他人收集文件。链接、权限与记录都集中在这里。"
    />
    <TransferWorkspace framed search={search} onNavigate={(next) => void navigate({ to: '/app/transfer', search: next })} />
  </AppShell>
}
