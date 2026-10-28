import { useNavigate, useSearch } from '@tanstack/react-router'
import { PublicTransferShell } from '../components/transfer/PublicTransferShell'
import { TransferServiceSummary, TransferWorkspace } from '../components/transfer/TransferWorkspace'

export function PublicTransferPage() {
  const search = useSearch({ from: '/transfer' })
  const navigate = useNavigate()
  return <PublicTransferShell title="文件中转" summary={<TransferServiceSummary />}>
    <TransferWorkspace search={search} onNavigate={(next) => void navigate({ to: '/transfer', search: next })} />
  </PublicTransferShell>
}
