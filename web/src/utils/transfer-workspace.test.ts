import { describe, expect, it } from 'vitest'
import { validateTransferRedirect, validateTransferSearch } from './transfer-workspace'

describe('transfer record navigation', () => {
  it('keeps a valid record deep link through login', () => {
    expect(validateTransferRedirect('/transfer?view=history&record=collect&id=201')).toBe('/transfer?view=history&record=collect&id=201')
    expect(validateTransferRedirect('/app/transfer')).toBe('/app/transfer?view=send')
  })
  it.each(['//evil.test/transfer', '/\\evil.test/transfer', 'https://evil.test/transfer', '/app/admin', '/transfer#hidden', '/transfer?view=unknown', '/transfer?view=history&record=collect&id=-1', '/transfer?next=https://evil.test'])('rejects an unsafe or invalid return path %s', (path) => {
    expect(validateTransferRedirect(path)).toBeUndefined()
  })
  it('drops invalid or misplaced record identifiers', () => {
    expect(validateTransferSearch({ view: 'collect', record: 'send', id: 1 })).toEqual({ view: 'collect' })
    expect(validateTransferSearch({ view: 'history', record: 'send', id: 1.5 })).toEqual({ view: 'history' })
    expect(validateTransferSearch({ view: 'history', record: 'collect', id: '9007199254740992' })).toEqual({ view: 'history' })
  })
})
