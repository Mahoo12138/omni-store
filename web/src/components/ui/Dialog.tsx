import type { ReactNode } from 'react'
import { Dialog } from '@base-ui-components/react'
import * as css from './Dialog.css'

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
  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={css.backdrop} />
        <Dialog.Viewport className={css.viewport}>
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
              <Dialog.Close className={css.close} aria-label="关闭">
                <CloseIcon />
              </Dialog.Close>
            </div>
            <div className={css.body}>{children}</div>
            {footer && <div className={css.footer}>{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
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
