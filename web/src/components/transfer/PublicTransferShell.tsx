import type { ReactNode } from 'react'
import { PageHeader } from '../shell/PageHeader'
import { PublicFrame } from '../shell/PublicFrame'

// 公开中转/取件/收集共用外壳。原先它跨模块借用 AnonymousUpload.styles 的
// 深色 hero + 浮起白卡，那套已废止，这里只是 PublicFrame + PageHeader 的一层薄封装。
export function PublicTransferShell({ title, description, summary, children }: {
  title: string
  description?: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <PublicFrame>
      <PageHeader title={title} description={description} actions={summary} />
      {children}
    </PublicFrame>
  )
}
