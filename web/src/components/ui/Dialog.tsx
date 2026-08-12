import { createContext, useContext, type ReactNode } from 'react'
import { Dialog } from '@base-ui-components/react/dialog'
import * as css from './Dialog.css'

const DialogDepthContext = createContext(0)

// base-ui Dialog 包装：受控 / 非受控均可。
// 用法：受控 - <Dialog open={open} onOpenChange={setOpen} ...>。
interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** 宽弹窗，用于编辑复杂表单（多字段）。 */
  wide?: boolean
  /** 底部按钮区（通常是"取消 / 确认"）。 */
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

  return (
    <DialogDepthContext.Provider value={depth}>
      <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
        <Dialog.Portal>
          {/* 嵌套弹窗必须拥有独立遮罩，并明确高于父弹窗，而不能依赖 Portal 的 DOM 顺序。 */}
          <Dialog.Backdrop
            className={css.backdrop}
            forceRender
            data-dialog-backdrop=""
            data-dialog-depth={depth}
            style={{ zIndex: `calc(${css.dialogBaseZIndex} + ${layerOffset})` }}
          />
          <Dialog.Viewport
            className={css.viewport}
            data-dialog-viewport=""
            data-dialog-depth={depth}
            style={{ zIndex: `calc(${css.dialogBaseZIndex} + ${layerOffset + 1})` }}
          >
            <Dialog.Popup className={wide ? css.popupWide : css.popup}>
              <div className={css.header}>
                <div>
                  <Dialog.Title className={css.title}>{title}</Dialog.Title>
                  {description && (
                    <Dialog.Description className={css.description}>
                      {description}
                    </Dialog.Description>
                  )}
                </div>
                <Dialog.Close className={css.close} aria-label="关闭弹窗">
                  <CloseIcon />
                </Dialog.Close>
              </div>
              <div className={css.body}>{children}</div>
              {footer && <div className={css.footer}>{footer}</div>}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </DialogDepthContext.Provider>
  )
}

// 关闭按钮里的 X 图标（避免依赖外部 icon 集合）
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

// 触发打开 Dialog 的按钮 helper（普通 button，自带 onClick）
interface TriggerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}
export function DialogTriggerButton({ children, ...props }: TriggerButtonProps) {
  return (
    <Dialog.Trigger
      {...(props as Record<string, unknown>)}
      className={(props as { className?: string }).className}
    >
      {children}
    </Dialog.Trigger>
  )
}
