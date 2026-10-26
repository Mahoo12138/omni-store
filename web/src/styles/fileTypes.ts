// 文件类型砖色（EntryIcon）与图标字色的唯一来源。
//
// 这里是深色豁免清单里的文件之一（docs/DESIGN_SYSTEM.md §深色）：
// 彩色文件砖是业务资产，Fluent 主题 token 里没有对应色，因此允许出现 oklch 字面量，
// 但每一档必须同时给出 light 与 dark 两个值——浅色下砖色压低、深色下把明度抬起来，
// 白字在两种底色上都保持对比。除本文件与 preview.css、global.css、ui/Button.tsx 之外
// 不得再出现颜色字面量。
//
// 同 media.ts / layout.ts：本文件被构建期 AOT 求值，必须保持纯 JS 语法（不 import React）。

export type ResolvedThemeLike = 'light' | 'dark'

/** 同一色位在不同主题下的取值。 */
export interface ThemePair {
  light: string
  dark: string
}

/** 一枚砖：底色 + 前景（字/图标）色。 */
export interface TileColors {
  bg: ThemePair
  fg: ThemePair
}

export function pickThemeColor(pair: ThemePair, resolved: ResolvedThemeLike): string {
  return pair[resolved]
}

// 图片扩展名与 EntryIcon 的砖、FileTable 的类型描述共用同一份判定。
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'] as const

const onBrand: ThemePair = { light: '#ffffff', dark: '#ffffff' }

/**
 * 具体类型砖：label 是砖上的字符，tile 是底色与字色。
 * 与 FileTable 的类型描述表保持同一份扩展名集合（Stage 8 合并）。
 */
export const fileTypeTiles: Record<string, { label: string; tile: TileColors }> = {
  pdf: {
    label: 'P',
    tile: { bg: { light: 'oklch(0.55 0.19 27)', dark: 'oklch(0.62 0.17 27)' }, fg: onBrand },
  },
  doc: {
    label: 'W',
    tile: { bg: { light: 'oklch(0.55 0.2 262)', dark: 'oklch(0.62 0.18 262)' }, fg: onBrand },
  },
  docx: {
    label: 'W',
    tile: { bg: { light: 'oklch(0.55 0.2 262)', dark: 'oklch(0.62 0.18 262)' }, fg: onBrand },
  },
  xls: {
    label: 'X',
    tile: { bg: { light: 'oklch(0.52 0.14 150)', dark: 'oklch(0.6 0.13 150)' }, fg: onBrand },
  },
  xlsx: {
    label: 'X',
    tile: { bg: { light: 'oklch(0.52 0.14 150)', dark: 'oklch(0.6 0.13 150)' }, fg: onBrand },
  },
  csv: {
    label: 'X',
    tile: { bg: { light: 'oklch(0.52 0.14 150)', dark: 'oklch(0.6 0.13 150)' }, fg: onBrand },
  },
  ppt: {
    label: 'P',
    tile: { bg: { light: 'oklch(0.6 0.15 55)', dark: 'oklch(0.66 0.14 55)' }, fg: onBrand },
  },
  pptx: {
    label: 'P',
    tile: { bg: { light: 'oklch(0.6 0.15 55)', dark: 'oklch(0.66 0.14 55)' }, fg: onBrand },
  },
  zip: {
    label: 'Z',
    tile: { bg: { light: 'oklch(0.53 0.17 300)', dark: 'oklch(0.61 0.15 300)' }, fg: onBrand },
  },
  rar: {
    label: 'Z',
    tile: { bg: { light: 'oklch(0.53 0.17 300)', dark: 'oklch(0.61 0.15 300)' }, fg: onBrand },
  },
  '7z': {
    label: 'Z',
    tile: { bg: { light: 'oklch(0.53 0.17 300)', dark: 'oklch(0.61 0.15 300)' }, fg: onBrand },
  },
  gz: {
    label: 'Z',
    tile: { bg: { light: 'oklch(0.53 0.17 300)', dark: 'oklch(0.61 0.15 300)' }, fg: onBrand },
  },
  mp4: {
    label: '▶',
    tile: { bg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.6 0.1 210)' }, fg: onBrand },
  },
  mkv: {
    label: '▶',
    tile: { bg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.6 0.1 210)' }, fg: onBrand },
  },
  mov: {
    label: '▶',
    tile: { bg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.6 0.1 210)' }, fg: onBrand },
  },
  mp3: {
    label: '♪',
    tile: { bg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.6 0.1 210)' }, fg: onBrand },
  },
  flac: {
    label: '♪',
    tile: { bg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.6 0.1 210)' }, fg: onBrand },
  },
  txt: {
    label: 'T',
    tile: { bg: { light: 'oklch(0.5 0.02 262)', dark: 'oklch(0.6 0.02 262)' }, fg: onBrand },
  },
  md: {
    label: 'M',
    tile: { bg: { light: 'oklch(0.5 0.02 262)', dark: 'oklch(0.6 0.02 262)' }, fg: onBrand },
  },
}

/**
 * 无类型砖（目录、图片、链接、通用文件）。目录只有字形色，砖底保持透明。
 */
export const entryTiles: Record<'dir' | 'image' | 'link' | 'file', TileColors> = {
  dir: {
    bg: { light: 'transparent', dark: 'transparent' },
    fg: { light: 'oklch(0.72 0.13 75)', dark: 'oklch(0.78 0.13 75)' },
  },
  image: {
    bg: { light: 'oklch(0.94 0.05 200)', dark: 'oklch(0.3 0.05 210)' },
    fg: { light: 'oklch(0.52 0.11 210)', dark: 'oklch(0.78 0.11 210)' },
  },
  link: {
    bg: { light: 'oklch(0.94 0.005 262)', dark: 'oklch(0.32 0.01 262)' },
    fg: { light: 'oklch(0.5 0.02 262)', dark: 'oklch(0.85 0.01 262)' },
  },
  file: {
    bg: { light: 'oklch(0.94 0.005 262)', dark: 'oklch(0.32 0.01 262)' },
    fg: { light: 'oklch(0.5 0.02 262)', dark: 'oklch(0.85 0.01 262)' },
  },
}

/**
 * 取扩展名（无扩展名返回空串）。
 * 语义与迁移前的 EntryIcon 一致：按最后一个点取，`.gitignore` 视为 gitignore，
 * 结尾是点则视为无扩展名。
 */
export function extensionOf(name: string): string {
  if (!name.includes('.')) return ''
  const ext = name.split('.').pop() ?? ''
  return ext.toLowerCase()
}

export function isImageName(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name))
}

/** 该文件名对应的类型砖；图片与未知类型回落到 entryTiles。 */
export function resolveFileTypeTile(
  name: string,
  resolved: ResolvedThemeLike,
): { label: string; background: string; color: string } | null {
  const tile = fileTypeTiles[extensionOf(name)]
  if (!tile) return null
  return {
    label: tile.label,
    background: pickThemeColor(tile.tile.bg, resolved),
    color: pickThemeColor(tile.tile.fg, resolved),
  }
}
