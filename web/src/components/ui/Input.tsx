import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'
import * as css from './Input.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, ...props }: InputProps) {
  const id = useId()
  if (!label) {
    return <input className={css.input} {...props} />
  }
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={css.input} {...props} />
    </div>
  )
}
