import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate } from './format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [100 * 1024, '100 KB'],
    [1024 ** 2, '1.0 MB'],
    [1024 ** 4, '1.0 TB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats a valid date in local time', () => {
    const localDate = new Date(2026, 0, 2, 3, 4)
    expect(formatDate(localDate.toISOString())).toBe('2026-01-02 03:04')
  })

  it('returns a placeholder for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('-')
  })
})
