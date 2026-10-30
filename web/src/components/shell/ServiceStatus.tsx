import type { ReactNode } from 'react'
import { mergeClasses } from '@fluentui/react-components'
import type { StateTone } from './StateView'
import { useStyles } from './ServiceStatus.styles'

// 公开侧服务状态的统一胶囊：首页、文件中转、匿名图床共用。
// 只表达「哪个服务 · 现在怎样」，重试等操作仍由调用方放在旁边，避免胶囊变成按钮。
export function ServiceStatus({
  label,
  value,
  tone,
  className,
}: {
  label: string
  value: ReactNode
  tone: StateTone
  className?: string
}) {
  const css = useStyles()
  return (
    <span className={mergeClasses(css.root, className ?? '')} aria-live="polite">
      <span className={css.dot} data-tone={tone} aria-hidden="true" />
      <span className={css.label}>{label}</span>
      <span className={css.divider} aria-hidden="true" />
      <span className={css.value}>{value}</span>
    </span>
  )
}
