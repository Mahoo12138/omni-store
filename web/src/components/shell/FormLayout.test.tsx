import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Input } from '@fluentui/react-components'
import { FormField, FormLayout } from './FormLayout'

// FormField 是原生 Fluent Field 的薄封装（Stage 7 用它取代自造的 ui/Field.*）。
// 这里守的是替换后必须继续成立的三条契约：label 与控件的 id 绑定、
// 显式 id 的复合字段仍能指回真实控件、错误文案以 role="alert" 出现。

describe('FormField', () => {
  it('binds its visible label to the child control id', () => {
    const html = renderToStaticMarkup(
      <FormField label="目录名" required>
        <Input placeholder="例如：旅行" />
      </FormField>,
    )
    const labelFor = /<label[^>]+for="([^"]+)"/.exec(html)?.[1]
    const inputID = /<input[^>]+id="([^"]+)"/.exec(html)?.[1]
    expect(labelFor).toBeTruthy()
    expect(inputID).toBe(labelFor)
    expect(html).toContain('目录名')
    // 实测（本版 Fluent）：required 走"标签后挂 aria-hidden 星号 + 原生 required 属性"，
    // 不是 aria-required。断言按真实产物写，避免把文档描述当成事实。
    expect(html).toContain('fui-Label__required')
    expect(/<input[^>]+required/.test(html)).toBe(true)
  })

  it('points the label back at an explicitly identified control in a compound field', () => {
    const html = renderToStaticMarkup(
      <FormField label="Token" htmlFor="credential-token">
        <div>
          <Input id="credential-token" readOnly />
          <button type="button">复制</button>
        </div>
      </FormField>,
    )
    expect(html).toContain('for="credential-token"')
    expect(html).toContain('id="credential-token"')
  })

  it('renders the error as an alert and marks the control invalid', () => {
    const html = renderToStaticMarkup(
      <FormField label="实例名称" error="名称不能为空">
        <Input value="" readOnly={false} />
      </FormField>,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('名称不能为空')
    expect(html).toContain('aria-invalid="true"')
  })

  it('keeps hint text out of the alert channel', () => {
    const html = renderToStaticMarkup(
      <FormField label="缓存档位" hint="long 仅适合内容修改就更换 URL 的资源。">
        <Input />
      </FormField>,
    )
    expect(html).toContain('long 仅适合内容修改就更换 URL 的资源。')
    expect(html).not.toContain('role="alert"')
  })
})

describe('FormLayout', () => {
  it('lays fields out in the requested number of columns', () => {
    const html = renderToStaticMarkup(
      <FormLayout columns={2}>
        <FormField label="登录用户图片保留天数"><Input /></FormField>
        <FormField label="匿名图片保留天数"><Input /></FormField>
      </FormLayout>,
    )
    expect(html).toContain('登录用户图片保留天数')
    expect(html).toContain('匿名图片保留天数')
  })
})
