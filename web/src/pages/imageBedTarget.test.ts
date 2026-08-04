import { describe, expect, it } from 'vitest'
import { resolveImageBedTarget } from './imageBedTarget'

describe('resolveImageBedTarget', () => {
  it('uses the first available target when no default has been saved', () => {
    expect(
      resolveImageBedTarget('', '', [
        { key: 'src-1111111111111111' },
        { key: 'src-2222222222222222' },
      ]),
    ).toBe('src-1111111111111111')
  })

  it('keeps an explicit selection ahead of the saved default', () => {
    expect(
      resolveImageBedTarget('src-2222222222222222', 'src-1111111111111111', [
        { key: 'src-1111111111111111' },
        { key: 'src-2222222222222222' },
      ]),
    ).toBe('src-2222222222222222')
  })

  it('returns an empty key only when there is no available target', () => {
    expect(resolveImageBedTarget('', '', [])).toBe('')
  })

  it('falls back when a selected or default target is no longer available', () => {
    expect(resolveImageBedTarget('removed', 'disabled', [{ key: 'src-1111111111111111' }])).toBe('src-1111111111111111')
  })
})
