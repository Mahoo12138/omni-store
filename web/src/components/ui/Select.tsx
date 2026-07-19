import type { ReactNode } from 'react'
import { Select as BaseSelect } from '@base-ui-components/react'
import { IconCheck, IconChevronDown } from './Icon'
import * as css from './Select.css'

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
  name?: string
  id?: string
  disabled?: boolean
  required?: boolean
  leadingIcon?: ReactNode
  size?: 'compact' | 'default' | 'large'
  width?: 'full' | 'content' | 'wide'
  className?: string
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = '请选择…',
  ariaLabel,
  name,
  id,
  disabled,
  required,
  leadingIcon,
  size = 'default',
  width = 'full',
  className,
}: SelectProps) {
  const triggerClassName = [
    css.trigger,
    css.triggerSize[size],
    css.triggerWidth[width],
    className,
  ].filter(Boolean).join(' ')

  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue)
      }}
      name={name}
      id={id}
      disabled={disabled}
      required={required}
      modal={false}
    >
      <BaseSelect.Trigger
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel ?? placeholder}
      >
        {leadingIcon ? <span className={css.leadingIcon}>{leadingIcon}</span> : null}
        <BaseSelect.Value className={css.value}>
          {(selectedValue) => {
            const option = options.find((item) => item.value === selectedValue)
            return option?.label ?? <span className={css.placeholder}>{placeholder}</span>
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className={css.icon}>
          <IconChevronDown size={14} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={css.positioner}
          sideOffset={6}
          collisionPadding={8}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className={css.popup}>
            <BaseSelect.List className={css.list}>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  className={css.item}
                  value={option.value}
                  disabled={option.disabled}
                >
                  <BaseSelect.ItemText className={css.itemText}>
                    {option.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className={css.itemIndicator}>
                    <IconCheck size={14} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
