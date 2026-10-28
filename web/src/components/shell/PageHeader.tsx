import type { ReactNode } from 'react'
import { Body1, Caption1Strong, Title1, Title3, mergeClasses } from '@fluentui/react-components'
import { useShellStyles } from './shell.styles'

// 页头：eyebrow + h1 标题 + 说明 + 右侧动作区。
// 标题用 Title1（= fontSizeHero800 32px），与既有页面标题尺寸一致。
export function PageHeader({
  eyebrow,
  title,
  titleId,
  description,
  actions,
  children,
  className,
  size = 'default',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  titleId?: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  /** compact：h1 用 Title3(24px) 且与内容的间距收到 24px，用于设置类页面。 */
  size?: 'default' | 'compact'
}) {
  const css = useShellStyles()
  return (
    <header
      className={mergeClasses(css.pageHeader, className ?? '')}
      data-compact={size === 'compact' ? '' : undefined}
    >
      {eyebrow ? (
        <Caption1Strong as="p" className={css.pageEyebrow}>
          {eyebrow}
        </Caption1Strong>
      ) : null}
      <div className={css.pageHeadline}>
        {size === 'compact' ? (
          <Title3 as="h1" id={titleId}>{title}</Title3>
        ) : (
          <Title1 as="h1" id={titleId}>{title}</Title1>
        )}
        {actions ? <div className={css.pageActions}>{actions}</div> : null}
      </div>
      {description ? (
        <Body1 as="p" className={css.pageDescription}>
          {description}
        </Body1>
      ) : null}
      {children}
    </header>
  )
}
