import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Banner } from './Banner'
import { PageHeader } from './PageHeader'
import { StateView } from './StateView'

// 这两个骨架件的契约是 e2e 的定位方式（getByRole('heading'|'status'|'alert')），
// 所以断言 markup 语义而不是样式类名。

describe('PageHeader', () => {
  it('renders the page title as the single h1 so getByRole(heading) still matches', () => {
    const html = renderToStaticMarkup(<PageHeader eyebrow="个人空间" title="收藏" description="说明" />)
    expect(html).toMatch(/<h1[^>]*>收藏<\/h1>/)
    expect(html).toContain('个人空间')
    expect(html).toContain('说明')
  })

  it('keeps actions out of the heading element', () => {
    const html = renderToStaticMarkup(
      <PageHeader title="流转中心" actions={<button type="button">新建</button>} />,
    )
    expect(html).toMatch(/<h1[^>]*>流转中心<\/h1>/)
    expect(html).toContain('新建')
  })
})

describe('StateView', () => {
  it('marks error states as a live alert region', () => {
    const html = renderToStaticMarkup(<StateView kind="error" title="收藏加载失败" description="重试" />)
    expect(html).toContain('role="alert"')
    expect(html).toMatch(/<h2[^>]*>收藏加载失败<\/h2>/)
  })

  it('marks pending and loading as status regions with aria-busy', () => {
    for (const kind of ['pending', 'loading'] as const) {
      const html = renderToStaticMarkup(<StateView kind={kind} title="正在读取收藏…" />)
      expect(html).toContain('role="status"')
      expect(html).toContain('aria-busy="true"')
    }
  })

  it('does not put a live-region role on an empty state', () => {
    const html = renderToStaticMarkup(<StateView kind="empty" title="还没有收藏" />)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('还没有收藏')
  })

  it('treats filtered and unavailable as static states without a live region', () => {
    for (const kind of ['filtered', 'unavailable'] as const) {
      const html = renderToStaticMarkup(<StateView kind={kind} title="没有符合条件的记录" />)
      expect(html).not.toContain('role="status"')
      expect(html).not.toContain('role="alert"')
      expect(html).toContain('没有符合条件的记录')
    }
  })

  it('renders the plain layout without a heading or card chrome', () => {
    const html = renderToStaticMarkup(
      <StateView layout="plain" kind="empty" title="还没有用户" description="创建后即可登录" />,
    )
    expect(html).not.toContain('<h2')
    expect(html).toContain('还没有用户')
    expect(html).toContain('创建后即可登录')
  })

  it('keeps the plain pending state as a role=status live region', () => {
    const html = renderToStaticMarkup(<StateView layout="plain" kind="pending" title="正在加载…" />)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
  })

  it('keeps the alert role on the wrapper because MessageBar itself is role=group', () => {
    const html = renderToStaticMarkup(<StateView kind="error" layout="inline" description="网络不可用" />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('role="group"')
  })
})

describe('Banner', () => {
  it('gives error and warning banners the alert role and info/success the status role', () => {
    expect(renderToStaticMarkup(<Banner intent="error">失败</Banner>)).toContain('role="alert"')
    expect(renderToStaticMarkup(<Banner intent="warning">冲突</Banner>)).toContain('role="alert"')
    expect(renderToStaticMarkup(<Banner intent="info">已进入只读</Banner>)).toContain('role="status"')
    expect(renderToStaticMarkup(<Banner intent="success">已保存</Banner>)).toContain('role="status"')
  })

  it('renders the message text inside the native MessageBar group', () => {
    const html = renderToStaticMarkup(<Banner intent="error">文件列表加载失败</Banner>)
    expect(html).toContain('role="group"')
    expect(html).toContain('文件列表加载失败')
  })

  it('defaults to info and keeps title and action reachable', () => {
    const html = renderToStaticMarkup(
      <Banner title="读取失败" action={<button type="button">重试</button>}>明细</Banner>,
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('读取失败')
    expect(html).toContain('重试')
    expect(html).toContain('明细')
  })
})
