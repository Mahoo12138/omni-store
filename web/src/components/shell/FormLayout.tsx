import type { ReactNode } from 'react'
import { Field, InfoLabel, mergeClasses } from '@fluentui/react-components'
import { useStyles } from './FormLayout.styles'

// 表单与字段骨架（Stage 7）：字段本体一律用 Fluent 原生 Field ——
// label / hint / validationMessage(+validationState=error) 由库负责，
// 错误文案自带 role="alert"，控件拿到 id、aria-invalid、aria-required，
// 不再自造 label+控件+提示的三层包裹（原 ui/Field.* 与 Field.utils.css 由此退役）。
//
// children 传 Fluent 控件（Input/Textarea/Checkbox…）时直接挂载即可，
// 它们内部会消费 Field 上下文；传非 Fluent 控件（如本项目包过的 Select，
// 内核 Dropdown 不消费上下文）时请保留显式 aria-label，与今天的行为一致。

export interface FormFieldProps {
  label?: string
  /**
   * 控件自带显式 id 时（Field 自动生成的 id 会被控件自己的 id 覆盖），
   * 用它把 Label 的 htmlFor 指回真实控件。
   */
  htmlFor?: string
  hint?: string
  /**
   * 约束/后果类说明：渲染为 label 旁的信息按钮（Fluent InfoLabel），
   * 点开才展开，不占常驻布局。输入示例这类必须常驻的提示仍用 hint。
   */
  info?: string
  /** 错误文案：渲染为 Field 的 validationMessage，红色并带 role="alert"。 */
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}

export function FormField({ label, htmlFor, hint, info, error, required, className, children }: FormFieldProps) {
  const css = useStyles()
  const labelSlot = label === undefined
    ? undefined
    : info
      ? <InfoLabel info={info} label={{ children: label, htmlFor }} />
      : htmlFor ? { children: label, htmlFor } : label
  return (
    <Field
      className={mergeClasses(css.field, className)}
      label={labelSlot}
      hint={hint}
      required={required}
      validationMessage={error}
      validationState={error ? 'error' : undefined}
    >
      {children}
    </Field>
  )
}

export interface FormLayoutProps {
  /** 栅格列数；窄屏自动塌陷（2 列→1 列 @480px，3 列→2 列 @640px→1 列 @480px）。 */
  columns?: 1 | 2 | 3
  className?: string
  children: ReactNode
}

export function FormLayout({ columns = 1, className, children }: FormLayoutProps) {
  const css = useStyles()
  const grid = columns === 2 ? css.gridTwo : columns === 3 ? css.gridThree : undefined
  return <div className={mergeClasses(css.grid, grid, className)}>{children}</div>
}

/** 表单动作行：右对齐、窄屏换行，供弹窗底部或页面内联表单使用。 */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  const css = useStyles()
  return <div className={mergeClasses(css.actions, className)}>{children}</div>
}
