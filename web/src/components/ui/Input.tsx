import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'
import * as css from './Input.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

export function Input({ label, hint, id: providedId, 'aria-describedby': describedBy, ...props }: InputProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const hintId = hint ? `${id}-hint` : undefined
  if (!label) {
    return <input id={id} className={css.input} aria-describedby={describedBy ?? hintId} {...props} />
  }
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={css.input} aria-describedby={describedBy ?? hintId} {...props} />
      {hint ? <span id={hintId} className={css.hint}>{hint}</span> : null}
    </div>
  )
}
