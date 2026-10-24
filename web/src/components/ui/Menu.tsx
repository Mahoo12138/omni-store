import type { ComponentProps, ReactNode } from 'react'
import {
  Menu as FluentMenu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from '@fluentui/react-components'
import { useStyles } from './Menu.styles'

export interface MenuOption {
  id: string
  label: string
  icon?: ReactNode
  suffix?: ReactNode
  current?: boolean
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface MenuProps {
  ariaLabel: string
  trigger: ReactNode
  items: MenuOption[]
  triggerClassName?: string
}

export function ItemView({ item }: { item: MenuOption }) {
  const css = useStyles()
  const danger = item.danger ? css.danger : undefined
  // 槽位类型不收任意 ReactNode（suffix 可能是任何节点），在边界断言
  const secondaryContent = item.suffix as ComponentProps<typeof MenuItem>['secondaryContent']
  return (
    <MenuItem
      disabled={item.disabled}
      aria-current={item.current ? 'page' : undefined}
      onClick={() => item.onSelect()}
      icon={item.icon ? <span className={danger}>{item.icon}</span> : undefined}
      secondaryContent={secondaryContent}
    >
      <span className={danger}>{item.label}</span>
    </MenuItem>
  )
}

/** 通用下拉菜单：触发器、定位和键盘交互统一交给 Fluent Menu。 */
export function Menu({ ariaLabel, trigger, items, triggerClassName }: MenuProps) {
  const css = useStyles()
  return (
    <FluentMenu>
      <MenuTrigger>
        <button type="button" className={triggerClassName ?? css.trigger} aria-label={ariaLabel}>
          {trigger}
        </button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList aria-label={ariaLabel}>
          {items.map((item) => (
            <ItemView key={item.id} item={item} />
          ))}
        </MenuList>
      </MenuPopover>
    </FluentMenu>
  )
}
