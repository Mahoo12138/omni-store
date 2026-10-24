import type { ReactNode } from 'react'
import { Badge as FluentBadge } from '@fluentui/react-components'

export type BadgeColor = 'blue' | 'gray' | 'green' | 'purple' | 'red'

// Fluent Badge 原生语义色：blue→brand、green→success、red→danger、
// purple→important、gray→informative；tint 外观为浅底色字。
const colorMap: Record<BadgeColor, 'brand' | 'success' | 'danger' | 'important' | 'informative'> = {
  blue: 'brand',
  green: 'success',
  red: 'danger',
  purple: 'important',
  gray: 'informative',
}

export function Badge({ color, children }: { color: BadgeColor; children: ReactNode }) {
  return (
    <FluentBadge appearance="tint" color={colorMap[color]} size="small">
      {children}
    </FluentBadge>
  )
}
