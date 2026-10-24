import {
  createContext,
  useId,
  useContext,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

// 自研标签页：role=tablist/tab/tabpanel + 方向键自动激活（WAI-ARIA tabs 模式）。
// API 形状与原 base-ui Tabs 一致（Tabs.Root/List/Tab/Panel），页面用法不变；
// Tab 渲染 button 并带 data-active/aria-selected，兼容既有样式选择器。

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
  /** 面板可访问名关联：Tab/Panel 共用的 id 前缀 */
  uid: string
}
const TabsContext = createContext<TabsContextValue | null>(null)

function TabsRoot({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: ReactNode
}) {
  const [internal, setInternal] = useState(defaultValue ?? '')
  const uid = useId()
  const value = controlled ?? internal
  const setValue = (next: string) => {
    if (next === value) return
    if (controlled === undefined) setInternal(next)
    onValueChange?.(next)
  }
  return (
    <TabsContext.Provider value={{ value, setValue, uid }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  'aria-label': ariaLabel,
  children,
}: {
  className?: string
  'aria-label': string
  children: ReactNode
}) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
    )
    if (tabs.length === 0) return
    const current = tabs.findIndex((tab) => tab === document.activeElement)
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1 + tabs.length) % tabs.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next < 0) return
    event.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

function TabsTab({
  value,
  className,
  disabled,
  children,
}: {
  value: string
  className?: string
  disabled?: boolean
  children: ReactNode
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs.Tab 必须在 Tabs.Root 内使用')
  const selected = ctx.value === value
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.uid}-tab-${value}`}
      aria-selected={selected}
      data-active={selected ? '' : undefined}
      data-value={value}
      tabIndex={selected ? 0 : -1}
      className={className}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
    >
      {children}
    </button>
  )
}

function TabsPanel({
  value,
  className,
  keepMounted,
  children,
}: {
  value: string
  className?: string
  keepMounted?: boolean
  children: ReactNode
}) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs.Panel 必须在 Tabs.Root 内使用')
  const selected = ctx.value === value
  if (!selected && !keepMounted) return null
  return (
    <div role="tabpanel" aria-labelledby={`${ctx.uid}-tab-${value}`} className={className} hidden={!selected}>
      {children}
    </div>
  )
}

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
}
