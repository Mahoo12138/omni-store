import {
  TabList as FluentTabList,
  Tab as FluentTab,
  mergeClasses,
  tabClassNames,
} from '@fluentui/react-components'
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'

// Fluent TabList 包装:保持 Tabs.Root/List/Tab/Panel 的项目内 API(页面零改动)。
// 键盘导航/roving tabindex/aria 语义全部交给 Fluent;Panel 用 hidden div 实现
// keepMounted 语义(草稿状态保活)。

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
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
  const value = controlled ?? internal
  const setValue = (next: string) => {
    if (next === value) return
    if (controlled === undefined) setInternal(next)
    onValueChange?.(next)
  }
  return (
    <TabsContext.Provider value={{ value, setValue }}>
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
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs.List 必须在 Tabs.Root 内使用')
  return (
    <FluentTabList
      selectedValue={ctx.value}
      onTabSelect={(_, data) => ctx.setValue(String(data.value))}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </FluentTabList>
  )
}

// Fluent Tab 默认外观已品牌化;页面级 className(原 outlineTab 等)经 mergeClasses
// 叠加,组件样式在其后插入可覆盖默认。
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
  return (
    <FluentTab
      value={value}
      disabled={disabled}
      id={`omnistore-tab-${value}`}
      className={mergeClasses(tabClassNames.root, className ?? '')}
    >
      {children}
    </FluentTab>
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
    <div role="tabpanel" aria-labelledby={`omnistore-tab-${value}`} className={className} hidden={!selected}>
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
