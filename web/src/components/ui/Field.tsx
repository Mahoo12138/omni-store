import { cloneElement, isValidElement, useId } from 'react'
import type { ReactElement, ReactNode } from 'react'
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
  const generatedId = useId()
  const child = isValidElement(children) ? children as ReactElement<{ id?: string }> : null
  const controlId = child?.props.id ?? generatedId
  const control = child ? cloneElement(child, { id: controlId }) : children
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={controlId}>
        {label}
        {required && (
          <span style={{ color: 'var(--danger, #d04040)', marginLeft: 4 }} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {(error || hint) && (
        <span className={error ? css.hintError : css.hint}>{error || hint}</span>
      )}
    </div>
  )
}
