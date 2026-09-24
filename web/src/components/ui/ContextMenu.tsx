import { ContextMenu as BaseContextMenu } from '@base-ui-components/react/context-menu'
import type { ReactElement } from 'react'
import type { MenuOption } from './Menu'
import * as css from './Menu.css'

/** Right-click/long-press menu that shares the visual and keyboard behavior of Menu. */
export function ContextMenu({ ariaLabel, trigger, items }: {
  ariaLabel: string
  trigger: ReactElement<Record<string, unknown>>
  items: MenuOption[]
}) {
  if (items.length === 0) return trigger
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger aria-label={ariaLabel} render={trigger} />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner side="right" align="start" sideOffset={4}>
          <BaseContextMenu.Popup className={css.popup}>
            {items.map((item) => (
              <BaseContextMenu.Item
                key={item.id}
                className={item.danger ? css.itemDanger : css.item}
                disabled={item.disabled}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => item.onSelect()}
              >
                <span className={css.itemIcon}>{item.icon}</span>
                <span className={css.itemLabel}>{item.label}</span>
                {item.suffix && <span className={css.itemSuffix}>{item.suffix}</span>}
              </BaseContextMenu.Item>
            ))}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}
