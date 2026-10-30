import type { ReactNode } from 'react'
import { mergeClasses } from '@fluentui/react-components'
import { useSharedStyles } from './shared.styles'

export type SectionTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

// 全站设置页的统一卡片：tinted 卡头（32px 图标位 + 标题/说明 + 动作）与数据体。
// 不传 title 时按工具栏卡头处理（图标与说明垂直居中），用于页面 h1 已经点名模块的表格页。
export function SectionCard({
  icon,
  tone = 'neutral',
  title,
  titleAs: Heading = 'h2',
  titleId,
  badge,
  hint,
  actions,
  busy,
  as: Root = 'section',
  ariaLabel,
  bodyPadding = 'default',
  className,
  children,
}: {
  icon: ReactNode
  tone?: SectionTone
  title?: ReactNode
  titleAs?: 'h2' | 'h3' | 'h4'
  titleId?: string
  badge?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  busy?: boolean
  as?: 'section' | 'article'
  ariaLabel?: string
  bodyPadding?: 'default' | 'none'
  className?: string
  children?: ReactNode
}) {
  const css = useSharedStyles()
  const toolbar = title === undefined
  const hasBody = children !== undefined && children !== null
  return (
    <Root
      className={mergeClasses(css.card, className ?? '')}
      aria-label={ariaLabel}
      aria-busy={busy}
    >
      <header className={css.cardHeader}>
        <div className={mergeClasses(css.cardHeaderCopy, toolbar ? css.cardHeaderCopyToolbar : '')}>
          <span className={css.iconChip} data-tone={tone} aria-hidden="true">{icon}</span>
          <div className={css.cardTitleBlock}>
            {toolbar ? null : (
              <div className={css.cardTitleRow}>
                <Heading id={titleId} className={css.cardTitle}>{title}</Heading>
                {badge}
              </div>
            )}
            {hint ? <p className={mergeClasses(css.cardHint, toolbar ? css.cardHintToolbar : '')}>{hint}</p> : null}
          </div>
        </div>
        {actions ? <div className={css.cardHeaderActions}>{actions}</div> : null}
      </header>
      {hasBody ? (
        <div className={mergeClasses(css.cardBody, bodyPadding === 'none' ? css.cardBodyFlush : '')}>{children}</div>
      ) : null}
    </Root>
  )
}
