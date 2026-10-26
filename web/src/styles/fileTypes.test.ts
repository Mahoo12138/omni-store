import { describe, expect, it } from 'vitest'
import {
  entryTiles,
  extensionOf,
  fileTypeTiles,
  isImageName,
  pickThemeColor,
  resolveFileTypeTile,
} from './fileTypes'

// 文件类型砖是深色反转的高危区：浅色档是"亮底 + 白字/深字"，深色档必须把底色压暗、
// 前景提亮，否则砖在 #292929 画布上会糊成一片或直接隐形。

describe('fileTypes 双主题砖色', () => {
  it('gives every brick an explicit light and dark value', () => {
    for (const [name, tile] of Object.entries(fileTypeTiles)) {
      expect(tile.tile.bg.light, `${name} light bg`).toBeTruthy()
      expect(tile.tile.bg.dark, `${name} dark bg`).toBeTruthy()
      expect(tile.tile.bg.dark, `${name} dark bg differs`).not.toBe(tile.tile.bg.light)
      expect(tile.tile.fg.light).toBe(tile.tile.fg.dark) // 白字两档一致
    }
    for (const [name, tile] of Object.entries(entryTiles)) {
      expect(tile.bg.light, `${name}`).toBeTruthy()
      expect(tile.bg.dark, `${name}`).toBeTruthy()
      expect(tile.fg.light, `${name}`).toBeTruthy()
      expect(tile.fg.dark, `${name}`).toBeTruthy()
    }
  })

  it('darkens the pale chips instead of leaving them light-on-dark', () => {
    // 淡底一族(图片/链接/未知)在深色下必须降到 0.5 明度以下。
    for (const key of ['image', 'link', 'file'] as const) {
      expect(entryTiles[key].bg.dark).toMatch(/^oklch\(0\.[0-4]/)
      expect(entryTiles[key].fg.dark).toMatch(/^oklch\(0\.[5-9]/)
    }
  })

  it('picks the requested theme', () => {
    expect(pickThemeColor({ light: 'L', dark: 'D' }, 'light')).toBe('L')
    expect(pickThemeColor({ light: 'L', dark: 'D' }, 'dark')).toBe('D')
  })

  it('resolves a typed brick per theme and returns null for unknown types', () => {
    const pdfLight = resolveFileTypeTile('报告.PDF', 'light')
    const pdfDark = resolveFileTypeTile('报告.PDF', 'dark')
    expect(pdfLight?.label).toBe('P')
    expect(pdfDark?.label).toBe('P')
    expect(pdfLight?.background).not.toBe(pdfDark?.background)
    expect(pdfLight?.color).toBe('#ffffff')
    expect(resolveFileTypeTile('notes.unknownext', 'dark')).toBeNull()
    expect(resolveFileTypeTile('README', 'dark')).toBeNull()
  })

  it('keeps the legacy extension semantics', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('.gitignore')).toBe('gitignore')
    expect(extensionOf('trailing.')).toBe('')
    expect(extensionOf('plain')).toBe('')
    expect(isImageName('a.PNG')).toBe(true)
    expect(isImageName('a.svg')).toBe(true)
    expect(isImageName('a.psdtxt')).toBe(false)
  })

  it('covers the type labels the file table relies on', () => {
    for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'zip', 'rar', '7z', 'gz', 'mp4', 'mkv', 'mov', 'mp3', 'flac', 'txt', 'md']) {
      expect(fileTypeTiles[ext], ext).toBeDefined()
    }
  })
})
