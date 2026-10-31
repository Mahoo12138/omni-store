import type { ReactElement, ReactNode } from 'react'
import {
  Button as FluentButton,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Overflow,
  OverflowItem,
  useIsOverflowItemVisible,
  useOverflowMenu,
} from '@fluentui/react-components'
import { Button, type ButtonVariant } from '../ui/Button'
import { IconMore } from '../ui/Icon'
import { useStyles } from './CommandBar.styles'

// 上下文命令条：左侧状态文案，右侧一组操作。
// 窗口变窄时操作按优先级收进「更多」菜单，而不是把一排按钮折成两行。
export interface CommandBarAction {
  id: string
  label: string
  icon?: ReactElement
  onClick: () => void
  disabled?: boolean
  variant?: ButtonVariant
  /** 越大越晚被收进溢出菜单；省略时按 DOM 顺序。 */
  priority?: number
}

export function CommandBar({
  label,
  status,
  actions,
}: {
  /** role=toolbar 的可访问名 */
  label: string
  status: ReactNode
  actions: CommandBarAction[]
}) {
  const css = useStyles()
  return (
    <Overflow minimumVisible={1} overflowAxis="horizontal" padding={48}>
      <div className={css.root} role="toolbar" aria-label={label}>
        {/* 固定段也交给溢出管理器测量，否则它会误判可用宽度。 */}
        <OverflowItem id="command-bar-summary" pinned>
          <div className={css.copy}>
            <strong className={css.status}>{status}</strong>
          </div>
        </OverflowItem>
        <div className={css.actions}>
          {actions.map((action) => (
            <OverflowItem key={action.id} id={action.id} priority={action.priority}>
              <Button
                variant={action.variant}
                icon={action.icon}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            </OverflowItem>
          ))}
          <CommandBarOverflow actions={actions} />
        </div>
      </div>
    </Overflow>
  )
}

function CommandBarOverflow({ actions }: { actions: CommandBarAction[] }) {
  const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>()
  if (!isOverflowing) return null
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <FluentButton
          ref={ref}
          appearance="subtle"
          icon={<IconMore size={16} />}
          aria-label={`还有 ${overflowCount} 项操作`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {actions.map((action) => (
            <OverflowMenuItem key={action.id} action={action} />
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

// 只把真正溢出的操作放进菜单，避免与可见按钮重复。
function OverflowMenuItem({ action }: { action: CommandBarAction }) {
  const visible = useIsOverflowItemVisible(action.id)
  if (visible) return null
  return (
    <MenuItem
      icon={action.icon}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </MenuItem>
  )
}
