import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import {
  Dialog as FluentDialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
} from '@fluentui/react-components'
import { useStyles } from './Dialog.styles'
import { layout } from '../../styles/layout'

// Fluent Dialog 内核:开合/portal/焦点圈/滚动锁/嵌套层级全部交给 Fluent。
// DialogWrap 的 props API 保持不变,调用方零改动。
// - 嵌套深度经 DialogDepthContext 计数,backdrop/data-dialog-* 标记与 zIndex
//   供 E2E 断言嵌套层级(admin-settings-ui)。
// - Escape 让位:弹窗内 Fluent Dropdown/Menu 浮层打开时,Esc 只关浮层不关弹窗。

const DialogDepthContext = createContext(0)
const DIALOG_BASE_Z_INDEX = layout.zIndexDialog

// 背景隔离计数(Fluent 的 tabster 隔离是异步的,弹窗打开后约几百毫秒才对背景
// aria-hidden;页面级 role 查询会在窗口期内撞上背景同名元素)。这里在打开的
// 同一提交里同步隐藏背景,与 tabster 的管理叠加:同值写入、计数归零才移除。
const ariaHiddenCounts = new Map<Element, number>()

function isolateBackground() {
  const touched: Element[] = []
  for (const child of Array.from(document.body.children)) {
    if (child.hasAttribute('data-dialog-backdrop')) continue
    if (child.querySelector('[role="dialog"], [data-dialog-backdrop]')) continue
    const count = ariaHiddenCounts.get(child) ?? 0
    ariaHiddenCounts.set(child, count + 1)
    touched.push(child)
    if (count === 0) child.setAttribute('aria-hidden', 'true')
  }
  return () => {
    for (const child of touched) {
      const count = ariaHiddenCounts.get(child) ?? 1
      if (count <= 1) {
        ariaHiddenCounts.delete(child)
        child.removeAttribute('aria-hidden')
      } else {
        ariaHiddenCounts.set(child, count - 1)
      }
    }
  }
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** 宽弹窗,用于编辑复杂表单(多字段)。 */
  wide?: boolean
  /** 底部按钮区(通常是"取消 / 确认")。 */
  footer?: ReactNode
  children: ReactNode
}

export function DialogWrap({
  open,
  onOpenChange,
  title,
  description,
  wide,
  footer,
  children,
}: DialogProps) {
  const depth = useContext(DialogDepthContext) + 1
  const layerOffset = (depth - 1) * 2
  const css = useStyles()

  useLayoutEffect(() => {
    if (!open) return
    return isolateBackground()
  }, [open])

  return (
    <FluentDialog
      open={open}
      onOpenChange={(_, data) => {
        if (
          !data.open &&
          data.event?.type === 'keydown' &&
          typeof document !== 'undefined' &&
          document.querySelector('.fui-Listbox, .fui-MenuPopover')
        ) {
          // 浮层开着:这次 Escape 归浮层,弹窗保持
          return
        }
        onOpenChange(data.open)
      }}
    >
      <DialogDepthContext.Provider value={depth}>
        <DialogSurface
          backdrop={
            {
              'data-dialog-backdrop': '',
              'data-dialog-depth': depth,
              style: { zIndex: DIALOG_BASE_Z_INDEX + layerOffset },
            } as object
          }
          style={{
            width: `min(${wide ? layout.dialogWideWidthPx : layout.dialogWidthPx}px, calc(100vw - ${layout.viewportInsetPx}px))`,
            maxWidth: `calc(100vw - ${layout.viewportInsetPx}px)`,
            zIndex: DIALOG_BASE_Z_INDEX + layerOffset + 1,
          }}
        >
          <DialogTrigger action="close">
            <button type="button" className={css.close} aria-label="关闭弹窗">
              <CloseIcon />
            </button>
          </DialogTrigger>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            {description ? <p className={css.description}>{description}</p> : null}
            <DialogContent>{children}</DialogContent>
            {footer ? (
              <DialogActions className={css.actions}>{footer}</DialogActions>
            ) : null}
          </DialogBody>
        </DialogSurface>
      </DialogDepthContext.Provider>
    </FluentDialog>
  )
}

// 关闭按钮里的 X 图标(避免依赖外部图标集合)
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
