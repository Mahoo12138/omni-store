import type { ButtonHTMLAttributes } from 'react'
import { Button as FluentButton, makeStyles, tokens } from '@fluentui/react-components'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerGhost' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

// Fluent Button 原生外观；Fluent 没有内置 danger 变体，用调色板红 token 补齐
//（社区通行做法）。其余 variant 直接映射 appearance。
const useStyles = makeStyles({
  danger: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    color: tokens.colorPaletteRedForeground3,
    ':hover': { backgroundColor: tokens.colorPaletteRedBackground2 },
    ':active': { backgroundColor: tokens.colorPaletteRedBackground2 },
  },
  dangerGhost: {
    color: tokens.colorPaletteRedForeground1,
    ':hover': {
      color: tokens.colorPaletteRedForeground1,
      backgroundColor: tokens.colorPaletteRedBackground1,
    },
  },
})

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const styles = useStyles()
  const appearance =
    variant === 'primary' || variant === 'danger'
      ? 'primary'
      : variant === 'secondary'
        ? 'secondary'
        : 'subtle'
  const extra =
    variant === 'danger'
      ? styles.danger
      : variant === 'dangerGhost'
        ? styles.dangerGhost
        : undefined
  return (
    <FluentButton
      appearance={appearance}
      className={[extra, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
