import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate, formatRelativeTime } from './format'

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

describe('formatRelativeTime', () => {
  const now = new Date(2026, 9, 31, 14, 30)

  it.each([
    [new Date(2026, 9, 31, 14, 29, 45), '刚刚'],
    [new Date(2026, 9, 31, 15, 0), '刚刚'],
    [new Date(2026, 9, 31, 14, 25), '5 分钟前'],
    [new Date(2026, 9, 31, 9, 5), '今天 09:05'],
    [new Date(2026, 9, 30, 23, 10), '昨天 23:10'],
    [new Date(2026, 9, 28, 18, 0), '10月28日'],
    [new Date(2025, 11, 31, 8, 0), '2025年12月31日'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatRelativeTime(value.toISOString(), now)).toBe(expected)
  })

  it('returns a placeholder for invalid input', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('-')
  })
})
