import type { ReactNode } from 'react'
import { Dropdown, Option } from '@fluentui/react-components'
import { useStyles } from './Select.styles'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder?: string
  ariaLabel?: string
  /** 兼容保留：Fluent Dropdown 无原生表单语义，当前无调用方使用 */
  name?: string
  id?: string
  disabled?: boolean
  /** 兼容保留：当前无调用方使用 */
  required?: boolean
  leadingIcon?: ReactNode
  leadingIconVariant?: 'tile' | 'plain'
  size?: 'compact' | 'default' | 'large'
  width?: 'full' | 'content' | 'wide'
  className?: string
}

// Fluent Dropdown 内核：触发器内容通过 button 槽自定义（支持 leadingIcon），
// 弹层/选项用 Fluent 原生观感（主题已映射品牌色：选中项 primarySubtle 底、品牌勾）。
// Option 不传 text（仅多选摘要场景需要），展示与匹配都走 children/value。
export function Select({
  value,
  onValueChange,
  options,
  placeholder = '请选择…',
  ariaLabel,
  id,
  disabled,
  leadingIcon,
  leadingIconVariant = 'tile',
  size = 'default',
  width = 'full',
  className,
}: SelectProps) {
  const css = useStyles()
  const selected = options.find((item) => item.value === value)
  const triggerContent = (
    <>
      {leadingIcon ? (
        <span className={`${css.leadingIcon} ${leadingIconVariant === 'plain' ? css.leadingIconPlain : ''}`}>
          {leadingIcon}
        </span>
      ) : null}
      {selected ? (
        <span className={css.value}>{selected.label}</span>
      ) : (
        <span className={css.placeholder}>{placeholder}</span>
      )}
    </>
  )

  return (
    <Dropdown
      id={id}
      disabled={disabled}
      aria-label={ariaLabel ?? placeholder}
      size={size === 'compact' ? 'small' : size === 'large' ? 'large' : 'medium'}
      selectedOptions={value ? [value] : []}
      onOptionSelect={(_, data) => {
        if (data.optionValue !== undefined) onValueChange(String(data.optionValue))
      }}
      button={{ children: triggerContent }}
      className={[width === 'content' ? css.triggerWidthContent : width === 'wide' ? css.triggerWidthWide : css.triggerWidthFull, className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        // Option 的类型要求 children 为 ReactNode 时 text 必填（text 用于键盘 type-to-find）
        <Option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          text={typeof option.label === 'string' ? option.label : ''}
        >
          {option.label}
        </Option>
      ))}
    </Dropdown>
  )
}
