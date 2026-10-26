import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import {
  Toolbar,
  ToolbarRadioButton,
  ToolbarRadioGroup,
  mergeClasses,
} from '@fluentui/react-components'
import { useShellStyles } from './shell.styles'

export interface ViewSwitcherOption {
  value: string
  /** 可访问名；iconOnly 时只出现在 aria-label 上 */
  label: string
  icon?: ReactNode
  title?: string
  disabled?: boolean
}

// 视图切换（列表/网格/画廊）：没有对应的 tabpanel，所以它是单选组而不是标签页。
// 选中态由 Toolbar 自己持有（checkedValues 以 name 为键），不是 RadioGroup。
export function ViewSwitcher({
  ariaLabel,
  value,
  onChange,
  options,
  iconOnly = false,
  className,
}: {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  options: readonly ViewSwitcherOption[]
  iconOnly?: boolean
  className?: string
}) {
  const css = useShellStyles()
  const name = useId()
  return (
    <Toolbar
      aria-label={ariaLabel}
      checkedValues={{ [name]: [value] }}
      onCheckedValueChange={(_, data) => {
        const next = data.checkedItems[data.checkedItems.length - 1]
        if (next !== undefined) onChange(next)
      }}
      className={mergeClasses(css.viewSwitcher, className ?? '')}
    >
      <ToolbarRadioGroup>
        {options.map((option) => (
          <ToolbarRadioButton
            key={option.value}
            name={name}
            value={option.value}
            icon={option.icon as ComponentProps<typeof ToolbarRadioButton>['icon']}
            title={option.title}
            disabled={option.disabled}
            aria-label={option.label}
          >
            {iconOnly ? null : option.label}
          </ToolbarRadioButton>
        ))}
      </ToolbarRadioGroup>
    </Toolbar>
  )
}
