import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

// keepMounted 是产品要求：中转草稿切走 Tab 时标题/说明/已选文件不能丢
// （docs/DESIGN_SYSTEM.md §4）。Fluent TabList 不托管 panel，这层语义由本组件负责。
describe('Tabs', () => {
  it('keeps an inactive keepMounted panel in the DOM but hidden', () => {
    const html = renderToStaticMarkup(
      <Tabs.Root value="send">
        <Tabs.List aria-label="中转功能">
          <Tabs.Tab value="send">发送文件</Tabs.Tab>
          <Tabs.Tab value="collect">收集文件</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel keepMounted value="send"><input aria-label="发件包标题" /></Tabs.Panel>
        <Tabs.Panel keepMounted value="collect"><input aria-label="收集任务标题" /></Tabs.Panel>
      </Tabs.Root>,
    )
    expect(html).toContain('发件包标题')
    expect(html).toContain('收集任务标题')
    expect(html).toMatch(/role="tabpanel"[^>]*hidden/)
  })

  it('unmounts an inactive panel that is not keepMounted', () => {
    const html = renderToStaticMarkup(
      <Tabs.Root value="a">
        <Tabs.List aria-label="示例">
          <Tabs.Tab value="a">甲</Tabs.Tab>
          <Tabs.Tab value="b">乙</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="a">内容甲</Tabs.Panel>
        <Tabs.Panel value="b">内容乙</Tabs.Panel>
      </Tabs.Root>,
    )
    expect(html).toContain('内容甲')
    expect(html).not.toContain('内容乙')
  })

  it('lets Fluent own the tab semantics', () => {
    const html = renderToStaticMarkup(
      <Tabs.Root value="send">
        <Tabs.List aria-label="中转功能">
          <Tabs.Tab value="send">发送文件</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="send">正文</Tabs.Panel>
      </Tabs.Root>,
    )
    expect(html).toContain('role="tab"')
    expect(html).toContain('aria-selected="true"')
  })
})
