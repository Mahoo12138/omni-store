import type { ButtonHTMLAttributes } from 'react'
import * as css from './Button.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof css.button
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
  return <button className={css.button[variant]} {...props} />
}
