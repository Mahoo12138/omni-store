import type { ComponentProps, InputHTMLAttributes } from 'react'
import { useId } from 'react'
import { Input as FluentInput } from '@fluentui/react-components'
import * as css from './Input.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

// Fluent Input 原生外观；label/hint 内联模式沿用原布局。
// FluentInput 与原生 input 的 props 类型有联合类型差异（size/children/value），按其断言透传。
type FluentInputProps = ComponentProps<typeof FluentInput>

export function Input({ label, hint, id: providedId, 'aria-describedby': describedBy, ...rest }: InputProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const hintId = hint ? `${id}-hint` : undefined
  const props = rest as unknown as FluentInputProps
  if (!label) {
    return (
      <FluentInput id={id} aria-describedby={describedBy ?? hintId} {...props} />
    )
  }
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={id}>
        {label}
      </label>
      <FluentInput id={id} aria-describedby={describedBy ?? hintId} {...props} />
      {hint ? <span id={hintId} className={css.hint}>{hint}</span> : null}
    </div>
  )
}
