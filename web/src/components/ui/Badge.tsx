import type { ReactNode } from 'react'
import { Badge as FluentBadge, makeStyles } from '@fluentui/react-components'
import { fontSize, palette, radius, space } from '../../styles/palette'

export type BadgeColor = 'blue' | 'gray' | 'green' | 'purple' | 'red'

// Fluent Badge 内核：appearance=ghost 去掉默认底色，再按现有色板覆写，观感与自研版一致。
const useStyles = makeStyles({
  base: {
    height: '22px',
    paddingInline: space.sm,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
    fontWeight: 500,
  },
  // 读写
  blue: { backgroundColor: palette.primarySubtle, color: palette.primarySubtleInk },
  // 只读 / WebDAV
  gray: { backgroundColor: 'oklch(0.945 0.005 262)', color: palette.textSecondary },
  // 公开 / 成功
  green: { backgroundColor: palette.successSubtle, color: 'oklch(0.42 0.12 150)' },
  // 图床
  purple: { backgroundColor: palette.tilePurpleBg, color: palette.tilePurpleFg },
  // 失败 / 危险
  red: { backgroundColor: palette.dangerSubtle, color: palette.danger },
})

export function Badge({ color, children }: { color: BadgeColor; children: ReactNode }) {
  const styles = useStyles()
  return (
    <FluentBadge appearance="ghost" className={`${styles.base} ${styles[color]}`}>
      {children}
    </FluentBadge>
  )
}
