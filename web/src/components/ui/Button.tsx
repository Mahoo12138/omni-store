import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { Button as FluentButton, makeStyles, tokens } from '@fluentui/react-components'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerGhost' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Fluent 风格图标槽:渲染在 children 之前,仅 icon 无 children 时为图标按钮 */
  icon?: ReactElement
  /** Fluent 尺寸档：large=40px，用于触屏行内操作（原自研样式里的 44px 目标） */
  size?: 'small' | 'medium' | 'large'
  /** 图标可放文字前后 */
  iconPosition?: 'before' | 'after'
}

// Fluent Button 原生外观；Fluent 没有内置 danger 变体，用调色板红 token 补齐
//（社区通行做法）。其余 variant 直接映射 appearance。
// variant → Fluent appearance + 追加类；LinkButton 复用同一份映射，
// 保证「按钮」和「按钮样式的链接」在页面里只有一套语言。
const useStyles = makeStyles({
  danger: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    // 实心红底上必须用 onBrand 近白前景：colorPaletteRedForeground3 与
    // RedBackground3 是同一个红值，此前文字/图标等于隐形。
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorPaletteRedForeground1,
      color: tokens.colorNeutralForegroundOnBrand,
    },
    ':active': { backgroundColor: tokens.colorPaletteRedForeground1 },
    // disabled 态回退 Fluent 原生灰,否则灰字落在被覆盖的红底上不可见
    ':disabled': {
      backgroundColor: tokens.colorNeutralBackgroundDisabled,
      color: tokens.colorNeutralForegroundDisabled,
    },
  },
  dangerGhost: {
    color: tokens.colorPaletteRedForeground1,
    ':hover': {
      color: tokens.colorPaletteRedForeground1,
      backgroundColor: tokens.colorPaletteRedBackground1,
    },
  },
})

export function useButtonVariant(variant: ButtonVariant) {
  const styles = useStyles()
  return {
    appearance:
      variant === 'primary' || variant === 'danger'
        ? 'primary'
        : variant === 'secondary'
          ? 'secondary'
          : 'subtle',
    extra:
      variant === 'danger'
        ? styles.danger
        : variant === 'dangerGhost'
          ? styles.dangerGhost
          : undefined,
  } as const
}

export function Button({ variant = 'primary', className, icon, size, iconPosition, children, ...props }: ButtonProps) {
  const { appearance, extra } = useButtonVariant(variant)
  return (
    <FluentButton
      appearance={appearance}
      className={[extra, className].filter(Boolean).join(' ')}
      icon={icon}
      size={size}
      iconPosition={iconPosition}
      {...props}
    >
      {children}
    </FluentButton>
  )
}
