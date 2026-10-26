import type { ReactNode } from 'react'
import { Body1, Caption1Strong, Title1, mergeClasses } from '@fluentui/react-components'
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
}: {
  eyebrow?: ReactNode
  title: ReactNode
  titleId?: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const css = useShellStyles()
  return (
    <header className={mergeClasses(css.pageHeader, className ?? '')}>
      {eyebrow ? (
        <Caption1Strong as="p" className={css.pageEyebrow}>
          {eyebrow}
        </Caption1Strong>
      ) : null}
      <div className={css.pageHeadline}>
        <Title1 as="h1" id={titleId}>
          {title}
        </Title1>
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
