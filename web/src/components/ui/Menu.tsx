import { Fragment, type ComponentProps, type ReactNode } from 'react'
import {
  Menu as FluentMenu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from '@fluentui/react-components'
import { useStyles } from './Menu.styles'
import { Tooltip } from './Tooltip'

export interface MenuOption {
  id: string
  label: string
  icon?: ReactNode
  suffix?: ReactNode
  current?: boolean
  danger?: boolean
  disabled?: boolean
  /** 在该项之前插一条分隔线（把破坏性操作与常规操作隔开）。 */
  dividerBefore?: boolean
  onSelect: () => void
}

interface MenuProps {
  ariaLabel: string
  trigger: ReactNode
  items: MenuOption[]
  triggerClassName?: string
  /** 图标触发器的悬停提示；缺省回落到 ariaLabel。 */
  triggerTitle?: string
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
export function Menu({ ariaLabel, trigger, items, triggerClassName, triggerTitle }: MenuProps) {
  const css = useStyles()
  return (
    <FluentMenu>
      <Tooltip content={triggerTitle ?? ariaLabel}>
        <MenuTrigger>
          <button
            type="button"
            className={triggerClassName ?? css.trigger}
            aria-label={ariaLabel}
          >
            {trigger}
          </button>
        </MenuTrigger>
      </Tooltip>
      <MenuPopover>
        <MenuList aria-label={ariaLabel}>
          {items.map((item) => (
            <Fragment key={item.id}>
              {item.dividerBefore ? <MenuDivider /> : null}
              <ItemView item={item} />
            </Fragment>
          ))}
        </MenuList>
      </MenuPopover>
    </FluentMenu>
  )
}
