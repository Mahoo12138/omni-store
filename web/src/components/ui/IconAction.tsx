import type { MouseEventHandler, ReactElement, ReactNode } from 'react'
import { Button } from './Button'
import { Tooltip } from './Tooltip'
import { useStyles } from './IconAction.styles'

interface IconActionProps {
  /** 可访问名；同时作为默认 Tooltip 文案。 */
  label: string
  icon: ReactElement
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  danger?: boolean
  /** 行级上下文比按钮语义更长时，用更短的提示文案。 */
  tooltip?: ReactNode
}

// 表格操作列的统一图标入口：图标 + 可访问名 + hover/focus Tooltip。
export function IconAction({ label, icon, onClick, disabled, danger, tooltip }: IconActionProps) {
  const css = useStyles()
  return (
    <Tooltip content={tooltip ?? label} focusable={disabled}>
      <Button
        variant={danger ? 'dangerGhost' : 'ghost'}
        className={css.root}
        style={{ minWidth: 0 }}
        icon={icon}
        aria-label={label}
        data-danger={danger ? '' : undefined}
        disabled={disabled}
        onClick={onClick}
      />
    </Tooltip>
  )
}
