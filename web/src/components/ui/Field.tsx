import type { ReactNode } from 'react'
import * as css from './Field.css'

// 弹窗 / 表单字段容器
interface FieldProps {
  label: string
  /** 必填：自动在 label 旁加红色星号 */
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}
export function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div className={css.field}>
      <label className={css.label}>
        {label}
        {required && (
          <span style={{ color: 'var(--danger, #d04040)', marginLeft: 4 }} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && (
        <span className={error ? css.hintError : css.hint}>{error || hint}</span>
      )}
    </div>
  )
}
