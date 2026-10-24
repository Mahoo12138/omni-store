import type { ComponentProps, InputHTMLAttributes } from 'react'
import { useId } from 'react'
import { Input as FluentInput, makeStyles, shorthands } from '@fluentui/react-components'
import { fontSize, palette, radius, space } from '../../styles/palette'
import * as css from './Input.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

// Fluent Input 的 size/children 与原生 input 属性类型冲突，value/defaultValue 的联合类型
// 也更宽；项目实际只按受控文本输入使用，这里统一按 Fluent props 断言透传。
type FluentInputProps = ComponentProps<typeof FluentInput>

// Fluent Input 内核 + 品牌观感：36px 高、暖纸底、聚焦主色描边+光晕（替换 Fluent 的
// 底部下划线动画）。label/hint 内联模式沿用原布局样式。
const useStyles = makeStyles({
  root: {
    width: '100%',
    height: '36px',
    minHeight: 'unset',
    paddingInline: space.md,
    fontSize: fontSize.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    ...shorthands.borderColor(palette.border),
    ':hover': { ...shorthands.borderColor(palette.borderStrong) },
    ':focus': {
      ...shorthands.borderColor(palette.primary),
      boxShadow: `0 0 0 3px ${palette.primarySubtle}`,
    },
    '::placeholder': { color: palette.textSecondary },
    // 关闭 Fluent 的聚焦下划线 ::after 动画，统一用上面的描边+光晕
    '::after': { content: 'none' },
  },
})

export function Input({ label, hint, id: providedId, 'aria-describedby': describedBy, ...rest }: InputProps) {
  const styles = useStyles()
  const generatedId = useId()
  const id = providedId ?? generatedId
  const hintId = hint ? `${id}-hint` : undefined
  const props = rest as FluentInputProps
  if (!label) {
    return (
      <FluentInput id={id} className={styles.root} aria-describedby={describedBy ?? hintId} {...props} />
    )
  }
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={id}>
        {label}
      </label>
      <FluentInput id={id} className={styles.root} aria-describedby={describedBy ?? hintId} {...props} />
      {hint ? <span id={hintId} className={css.hint}>{hint}</span> : null}
    </div>
  )
}
