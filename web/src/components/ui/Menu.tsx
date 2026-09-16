import { Menu as BaseMenu } from '@base-ui-components/react/menu'
import type { ReactNode } from 'react'
import * as css from './Menu.css'

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

/** 通用下拉菜单：触发器、定位和键盘交互统一交给 Base UI。 */
export function Menu({ ariaLabel, trigger, items, triggerClassName }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        type="button"
        className={triggerClassName ?? css.trigger}
        aria-label={ariaLabel}
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align="end" sideOffset={6}>
          <BaseMenu.Popup className={css.popup}>
            {items.map((item) => (
              <BaseMenu.Item
                key={item.id}
                className={item.danger ? css.itemDanger : css.item}
                disabled={item.disabled}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => item.onSelect()}
              >
                <span className={css.itemIcon}>{item.icon}</span>
                <span className={css.itemLabel}>{item.label}</span>
                {item.suffix && <span className={css.itemSuffix}>{item.suffix}</span>}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
