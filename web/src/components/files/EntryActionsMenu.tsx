import { Menu, type MenuOption } from '../ui/Menu'
import { IconMore } from '../ui/Icon'
import { useStyles } from './EntryActionsMenu.styles'

// 行尾「更多」菜单：文件表格与网格共用，触发器保持 28px（触屏 44px）。
export function EntryActionsMenu({ entryName, items }: { entryName: string; items: MenuOption[] }) {
  const css = useStyles()
  return (
    <Menu
      ariaLabel={`更多操作 ${entryName}`}
      triggerTitle="更多操作"
      triggerClassName={css.trigger}
      trigger={<IconMore size={15} />}
      items={items}
    />
  )
}
