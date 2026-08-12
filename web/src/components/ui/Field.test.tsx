import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'
import { Input } from './Input'

describe('Field', () => {
  it('associates its visible label with the child control', () => {
    const html = renderToStaticMarkup(
      <Field label="目录名" required>
        <Input placeholder="例如：旅行" />
      </Field>,
    )
    const labelFor = html.match(/<label[^>]+for="([^"]+)"/)?.[1]
    const inputID = html.match(/<input[^>]+id="([^"]+)"/)?.[1]
    expect(labelFor).toBeTruthy()
    expect(inputID).toBe(labelFor)
    expect(html).toContain('目录名')
  })

  it('preserves an explicit child id', () => {
    const html = renderToStaticMarkup(
      <Field label="目标路径">
        <Input id="target-path" />
      </Field>,
    )
    expect(html).toContain('for="target-path"')
    expect(html).toContain('id="target-path"')
  })

  it('associates a label with an explicitly identified control inside a compound field', () => {
    const html = renderToStaticMarkup(
      <Field label="Token" htmlFor="credential-token">
        <div>
          <Input id="credential-token" readOnly />
          <button type="button">复制</button>
        </div>
      </Field>,
    )
    expect(html).toContain('for="credential-token"')
    expect(html).toContain('id="credential-token"')
  })
})
