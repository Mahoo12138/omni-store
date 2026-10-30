import { Tooltip as FluentTooltip, makeStyles } from '@fluentui/react-components'
import type { ComponentProps, ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** disabled 控件需要外层可聚焦才能用键盘唤出提示；普通按钮保持 false，避免多出 tab 停靠点。 */
  focusable?: boolean
}

// Fluent Tooltip 的 content 是 slot 类型（不接受 null/boolean 等 ReactNode 边角值），
// 项目实际只传字符串/元素，这里在边界断言。
type FluentTooltipProps = ComponentProps<typeof FluentTooltip>

// 触发器包裹 span 并保持可聚焦：让包裹 disabled 控件的场景也能悬停/聚焦出提示。
const useStyles = makeStyles({
  trigger: { display: 'inline-flex', flexShrink: 0 },
})

/** Fluent Tooltip 包装：disabled 控件可加 focusable，让提示也能通过键盘唤出。 */
export function Tooltip({ content, children, focusable = false }: TooltipProps) {
  const styles = useStyles()
  return (
    <FluentTooltip
      content={content as FluentTooltipProps['content']}
      relationship="description"
      positioning="above"
      withArrow
    >
      <span className={styles.trigger} tabIndex={focusable ? 0 : undefined}>
        {children}
      </span>
    </FluentTooltip>
  )
}
