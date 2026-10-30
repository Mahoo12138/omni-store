import type { ReactNode } from 'react'
import {
  Caption1Strong,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  mergeClasses,
} from '@fluentui/react-components'
import { LogoMark } from '../ui/Icon'
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

export type StateTone = 'neutral' | 'success' | 'warning' | 'error' | 'pending'

export interface StateStatus {
  tone: StateTone
  label: ReactNode
  hint?: ReactNode
}

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
//
// block/fill 是页面级状态面：公开侧传 brand + eyebrow，工作台不传 brand，
// 两者共用同一套 28px 标题、动作和底部署名线。语义色只落在 footer 的 6px 状态点上。
export function StateView({
  kind,
  layout = 'block',
  eyebrow,
  brand = false,
  status,
  titleAs = 2,
  title,
  description,
  action,
  icon,
  rows,
  className,
}: {
  kind: StateViewKind
  /** block=独立状态面；fill=撑满；plain=卡片/表格内部的无边框态；inline=表单内 MessageBar */
  layout?: 'block' | 'fill' | 'plain' | 'inline'
  /** 状态面上方的上下文标签，例如「公开网盘 · 访问状态」。 */
  eyebrow?: ReactNode
  /** 公开侧品牌状态面：LogoMark + 品牌色底纹 + 等距立方体水印。 */
  brand?: boolean
  /** 底部状态签名：左侧状态点与结论，右侧补充说明。 */
  status?: StateStatus
  /** 页面唯一标题时用 h1；嵌在页头下方时保持 h2。 */
  titleAs?: 1 | 2
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

  const surface = mergeClasses(
    css.stateSurface,
    brand ? css.stateSurfaceBranded : undefined,
    layout === 'fill' ? css.stateFill : undefined,
    kind === 'pending' ? css.stateBusy : undefined,
    className ?? '',
  )

  if (kind === 'pending') {
    return (
      <section className={surface} {...live}>
        <Spinner size="small" label={typeof title === 'string' ? title : '正在加载…'} />
      </section>
    )
  }

  const heading = title
    ? titleAs === 1
      ? <h1 className={css.stateTitle}>{title}</h1>
      : <h2 className={css.stateTitle}>{title}</h2>
    : null

  return (
    <section className={surface} {...live}>
      {kind === 'loading' ? (
        <SkeletonRows count={rows ?? 4} />
      ) : (
        <>
          {(brand || eyebrow) && (
            <div className={css.stateBrand}>
              {brand ? <LogoMark size={20} /> : null}
              {eyebrow ? (
                <Caption1Strong as="span" className={css.stateEyebrow}>
                  {eyebrow}
                </Caption1Strong>
              ) : null}
            </div>
          )}
          <div className={mergeClasses(css.stateContent, brand ? css.stateContentBranded : undefined)}>
            {icon && !brand ? <span className={css.stateIcon}>{icon}</span> : null}
            {heading}
            {description ? <p className={css.stateDescription}>{description}</p> : null}
            {action ? <div className={css.stateActionsStart}>{action}</div> : null}
          </div>
          {status ? (
            <div className={css.stateFooter}>
              <span className={css.stateStatus}>
                <span className={css.stateStatusDot} data-tone={status.tone} aria-hidden="true" />
                {status.label}
              </span>
              {status.hint ? <span className={css.stateHint}>{status.hint}</span> : null}
            </div>
          ) : null}
          {brand ? <StateWatermark className={css.stateWatermark} /> : null}
        </>
      )}
    </section>
  )
}

// 品牌 logo 的等距立方体线稿：右下方断开的一段虚线表示「连接未建立」。
// 纯装饰，不参与读屏；颜色由 stateWatermark 的 currentColor 决定，
// 淡出统一挂在根节点的 stroke/fill opacity 上（深色下才不会整块看不见）。
function StateWatermark({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 264"
      fill="none"
      strokeOpacity="0.5"
      fillOpacity="0.1"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M178 18 268 70 178 122 88 70 178 18Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M88 70v92l90 52 90-52V70M178 122v92"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M268 162 178 214"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="3 9"
      />
      <path
        d="M46 140 78 158 46 176 14 158 46 140Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M14 158v20l32 18 32-18v-20"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M78 158h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="2 5"
      />
      <circle cx="86" cy="158" r="2.2" fill="currentColor" fillOpacity="0.55" />
    </svg>
  )
}
