import type { ButtonHTMLAttributes } from 'react'
import { Button as FluentButton, makeStyles, shorthands } from '@fluentui/react-components'
import { fontSize, palette, radius, space } from '../../styles/palette'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerGhost' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

// Fluent Button 内核 + 现有品牌观感：高度/圆角/配色沿用自研版定义，颜色取 palette.ts 单一色源。
// 焦点环交给 Fluent 的 ::after 指示器（主题已把 colorStrokeFocus2 定为品牌色），
// 这里关闭元素自身 outline，避免与 global.css.ts 的全局 focus-visible 叠加成双环。
const useStyles = makeStyles({
  base: {
    height: '40px',
    gap: '6px',
    paddingInline: '18px',
    borderRadius: radius.md,
    fontSize: fontSize.md,
    fontWeight: 600,
    outlineStyle: 'none',
    ':disabled': { opacity: 0.5 },
    ':active': { transform: 'translateY(1px)' },
    '@media (max-width: 820px)': { height: '44px' },
  },
  // 图标钮（工具栏刷新、行内操作）用更窄的左右内距
  tight: { paddingInline: space.sm },
  primary: {
    backgroundColor: palette.primary,
    color: palette.textOnPrimary,
    ':hover': { backgroundColor: palette.primaryHover },
    ':active': { backgroundColor: palette.primaryActive },
  },
  secondary: {
    backgroundColor: palette.surface,
    color: palette.text,
    ...shorthands.borderColor(palette.border),
    ...shorthands.borderWidth('1px'),
    ...shorthands.borderStyle('solid'),
    ':hover': { backgroundColor: palette.surfaceHover, ...shorthands.borderColor(palette.borderStrong) },
  },
  danger: {
    backgroundColor: palette.danger,
    color: palette.textOnPrimary,
    ':hover': { backgroundColor: palette.dangerHover },
  },
  dangerGhost: {
    backgroundColor: 'transparent',
    color: palette.danger,
    ':hover': { backgroundColor: palette.dangerSubtle, color: palette.dangerHover },
  },
  ghost: {
    backgroundColor: 'transparent',
    color: palette.textSecondary,
    ':hover': { backgroundColor: palette.surfaceHover, color: palette.text },
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
  const classes = [styles.base, styles[variant]]
  if (variant === 'ghost' || variant === 'dangerGhost') classes.push(styles.tight)
  return (
    <FluentButton
      appearance={appearance}
      className={[...classes, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
