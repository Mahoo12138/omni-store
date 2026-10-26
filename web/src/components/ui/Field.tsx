import { cloneElement, isValidElement, useId } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Label, mergeClasses } from '@fluentui/react-components'
import { useStyles } from './Field.styles'

// 弹窗 / 表单字段容器：label（Fluent Label）+ 控件 + hint/error。
// id 关联逻辑保持不变：cloneElement 注入 id；复合字段用 htmlFor 指向内部控件。
interface FieldProps {
  label: string
  /** 复合字段中真实表单控件的 id；此时 Field 不会把 id 写到包裹元素。 */
  htmlFor?: string
  /** 必填：自动在 label 旁加红色星号 */
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  const css = useStyles()
  const generatedId = useId()
  const child = isValidElement(children) ? children as ReactElement<{ id?: string }> : null
  const controlId = htmlFor ?? child?.props.id ?? generatedId
  const control = child && htmlFor === undefined ? cloneElement(child, { id: controlId }) : children
  return (
    <div className={mergeClasses(css.field, className)}>
      <Label className={css.label} htmlFor={controlId} weight="regular">
        {label}
        {required && (
          <span style={{ color: 'var(--danger, var(--colorPaletteRedForeground1))', marginLeft: 4 }} aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {control}
      {(error || hint) && (
        <span className={error ? css.hintError : css.hint}>{error || hint}</span>
      )}
    </div>
  )
}
