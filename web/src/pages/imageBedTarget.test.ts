import { describe, expect, it } from 'vitest'
import { resolveImageBedTarget } from './imageBedTarget'

describe('resolveImageBedTarget', () => {
  it('uses the first available target when no default has been saved', () => {
    expect(
      resolveImageBedTarget('', '', [
        { source_id: 'photos' },
        { source_id: 'archive' },
      ]),
    ).toBe('photos')
  })

  it('keeps an explicit selection ahead of the saved default', () => {
    expect(
      resolveImageBedTarget('archive', 'photos', [
        { source_id: 'photos' },
        { source_id: 'archive' },
      ]),
    ).toBe('archive')
  })

  it('returns an empty id only when there is no available target', () => {
    expect(resolveImageBedTarget('', '', [])).toBe('')
  })

  it('falls back when a selected or default target is no longer available', () => {
    expect(resolveImageBedTarget('removed', 'disabled', [{ source_id: 'photos' }])).toBe('photos')
  })
})
