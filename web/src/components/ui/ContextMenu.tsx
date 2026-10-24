import { cloneElement, useRef, useState, type ReactElement } from 'react'
import { Menu as FluentMenu, MenuList, MenuPopover } from '@fluentui/react-components'
import { ItemView, type MenuOption } from './Menu'

// Fluent v9 没有现成的 ContextMenu：用受控 Menu + 鼠标坐标虚拟元素定位实现，
// 覆盖右键、键盘菜单键（Shift+F10）与移动端长按。
interface ContextMenuProps {
  ariaLabel: string
  trigger: ReactElement<Record<string, unknown>>
  items: MenuOption[]
}

export function ContextMenu({ ariaLabel, trigger, items }: ContextMenuProps) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<number | undefined>(undefined)
  const open = point !== null

  if (items.length === 0) return trigger

  const openAt = (x: number, y: number) => setPoint({ x, y })
  const close = () => setPoint(null)

  // 定位库的虚拟元素：把弹层锚到鼠标/长按坐标
  const target = {
    getBoundingClientRect: () => {
      const { x, y } = point ?? { x: 0, y: 0 }
      return { width: 0, height: 0, top: y, bottom: y, left: x, right: x, x, y } as DOMRect
    },
  }

  const triggerWithHandlers = cloneElement(trigger, {
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault()
      openAt(event.clientX, event.clientY)
    },
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = window.setTimeout(() => {
        openAt(touch.clientX, touch.clientY)
      }, 500)
    },
    onTouchEnd: () => window.clearTimeout(longPressTimer.current),
    onTouchMove: () => window.clearTimeout(longPressTimer.current),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault()
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        openAt(rect.left, rect.bottom)
      }
    },
  })

  return (
    <>
      {triggerWithHandlers}
      <FluentMenu
        open={open}
        onOpenChange={(_, data) => { if (!data.open) close() }}
        positioning={{ target, position: 'below', align: 'start', offset: { mainAxis: 2, crossAxis: 2 } }}
      >
        <MenuPopover>
          <MenuList aria-label={ariaLabel}>
            {items.map((item) => (
              <ItemView key={item.id} item={item} />
            ))}
          </MenuList>
        </MenuPopover>
      </FluentMenu>
    </>
  )
}
