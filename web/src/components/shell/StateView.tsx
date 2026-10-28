import type { ReactNode } from 'react'
import {
  Body1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  mergeClasses,
} from '@fluentui/react-components'
import { useShellStyles } from './shell.styles'
import { SkeletonRows } from './Skeletons'

export type StateViewKind =
  | 'pending' // 请求进行中（spinner）
  | 'loading' // 骨架占位
  | 'empty' // 从未有过数据
  | 'filtered' // 有数据，但当前筛选/搜索条件下为空
  | 'unavailable' // 能力未开启 / 未绑定 / 无权限
  | 'error' // 请求失败
  | 'result' // 操作完成的结果摘要

const ROLE: Record<StateViewKind, 'status' | 'alert' | undefined> = {
  pending: 'status',
  loading: 'status',
  result: 'status',
  error: 'alert',
  empty: undefined,
  filtered: undefined,
  unavailable: undefined,
}

const INTENT: Record<StateViewKind, 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'info',
  loading: 'info',
  result: 'success',
  error: 'error',
  empty: 'info',
  filtered: 'info',
  unavailable: 'info',
}

// 页面的四种非结果态收在一个组件里，role 契约由这里统一给：
// error → alert，pending/loading/result → status，empty 不带 role。
// MessageBar 自带 role="group" + aria-live，所以 inline 布局下用外层元素承载 role，
// 不能指望 MessageBar 根节点提供 alert/status。
export function StateView({
  kind,
  layout = 'block',
  title,
  description,
  action,
  icon,
  rows,
  className,
}: {
  kind: StateViewKind
  /** block=独立卡片；fill=撑满；plain=卡片/表格内部的无边框态；inline=表单内 MessageBar */
  layout?: 'block' | 'fill' | 'plain' | 'inline'
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  rows?: number
  className?: string
}) {
  const css = useShellStyles()
  const role = ROLE[kind]
  const busy = kind === 'pending' || kind === 'loading'
  const live = busy ? { role, 'aria-busy': true as const } : { role }

  // plain：用在已有卡片/表格内部，不画自己的边框，也不引入 h2 标题。
  if (layout === 'plain') {
    return (
      <div className={mergeClasses(css.statePlain, className ?? '')} {...live}>
        {busy ? (
          <Spinner size="tiny" label={typeof title === 'string' ? title : '正在加载…'} />
        ) : (
          <>
            {title ? <span className={css.statePlainTitle}>{title}</span> : null}
            {description ? <span className={css.statePlainText}>{description}</span> : null}
            {action ? <div className={css.stateActions}>{action}</div> : null}
          </>
        )}
      </div>
    )
  }

  if (layout === 'inline') {
    return (
      <div className={mergeClasses(css.stateInline, className ?? '')} {...live}>
        <MessageBar intent={INTENT[kind]}>
          <MessageBarBody>
            {title ? <MessageBarTitle>{title}</MessageBarTitle> : null}
            {description}
          </MessageBarBody>
        </MessageBar>
      </div>
    )
  }

  return (
    <section
      className={mergeClasses(layout === 'fill' ? css.stateFill : css.stateBlock, className ?? '')}
      {...live}
    >
      {kind === 'pending' ? <Spinner size="tiny" label={typeof title === 'string' ? title : '正在加载…'} /> : null}
      {kind === 'loading' ? <SkeletonRows count={rows ?? 4} /> : null}
      {icon && !busy ? <span className={css.stateIcon}>{icon}</span> : null}
      {title && !busy ? <Subtitle2 as="h2" className={css.stateTitle}>{title}</Subtitle2> : null}
      {description && !busy ? <Body1 as="p" className={css.stateDescription}>{description}</Body1> : null}
      {action ? <div className={css.stateActions}>{action}</div> : null}
    </section>
  )
}
