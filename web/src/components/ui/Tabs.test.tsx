import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

// keepMounted 是产品要求：编辑草稿切走 Tab 时标题/说明/已填内容不能丢
// （docs/DESIGN_SYSTEM.md §4）。Fluent TabList 不托管 panel，这层语义由本组件负责。
describe('Tabs', () => {
  it('keeps an inactive keepMounted panel in the DOM but hidden', () => {
    const html = renderToStaticMarkup(
      <Tabs.Root value="recent">
        <Tabs.List aria-label="文件视图">
          <Tabs.Tab value="recent">最近文件</Tabs.Tab>
          <Tabs.Tab value="favorites">收藏</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel keepMounted value="recent"><input aria-label="最近文件筛选" /></Tabs.Panel>
        <Tabs.Panel keepMounted value="favorites"><input aria-label="收藏筛选" /></Tabs.Panel>
      </Tabs.Root>,
    )
    expect(html).toContain('最近文件筛选')
    expect(html).toContain('收藏筛选')
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
      <Tabs.Root value="recent">
        <Tabs.List aria-label="文件视图">
          <Tabs.Tab value="recent">最近文件</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="recent">正文</Tabs.Panel>
      </Tabs.Root>,
    )
    expect(html).toContain('role="tab"')
    expect(html).toContain('aria-selected="true"')
  })
})
