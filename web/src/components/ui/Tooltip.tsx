import { Tooltip as FluentTooltip, makeStyles } from '@fluentui/react-components'
import type { ComponentProps, ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
}

// Fluent Tooltip 的 content 是 slot 类型（不接受 null/boolean 等 ReactNode 边角值），
// 项目实际只传字符串/元素，这里在边界断言。
type FluentTooltipProps = ComponentProps<typeof FluentTooltip>

// 触发器包裹 span 并保持可聚焦：让包裹 disabled 控件的场景也能悬停/聚焦出提示。
const useStyles = makeStyles({
  trigger: { display: 'inline-flex', flexShrink: 0 },
})

/** Fluent Tooltip 包装：触发器保持可聚焦，适合包裹 disabled 控件。 */
export function Tooltip({ content, children }: TooltipProps) {
  const styles = useStyles()
  return (
    <FluentTooltip
      content={content as FluentTooltipProps['content']}
      relationship="description"
      positioning="above"
      withArrow
    >
      <span className={styles.trigger} tabIndex={0}>
        {children}
      </span>
    </FluentTooltip>
  )
}
