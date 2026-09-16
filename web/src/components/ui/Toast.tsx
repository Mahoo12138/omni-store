import type { ReactNode } from 'react'
import { Toaster, toast } from 'sonner'
import { vars } from '../../styles/theme.css'
import * as css from './Toast.css'

export { toast }

export const appStatusToastID = 'app-status'

function appNotice(message: ReactNode, className: string, role: 'status' | 'alert') {
  return toast.custom(
    () => <div className={`${css.notice} ${className}`} role={role}>{message}</div>,
    {
      id: appStatusToastID,
      duration: 5000,
      dismissible: true,
      unstyled: true,
      position: 'bottom-right',
    },
  )
}

export function toastSuccess(message: ReactNode) {
  return appNotice(message, css.success, 'status')
}

export function toastError(message: ReactNode) {
  return appNotice(message, css.error, 'alert')
}

export function toastInfo(message: ReactNode) {
  return appNotice(message, css.info, 'status')
}

/**
 * 应用级通知容器：所有页面通知统一从右下角出现，避免把状态信息插进页面布局。
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      visibleToasts={4}
      offset={24}
      toastOptions={{
        style: {
          fontFamily: vars.font.body,
          borderRadius: vars.radius.md,
          fontSize: vars.fontSize.sm,
        },
      }}
    />
  )
}
