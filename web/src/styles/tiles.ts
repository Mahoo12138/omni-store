import { palette } from './palette'

// 图标砖配色对：识别实体（存储源、快速操作），不做装饰。
export const tilePalettes = [
  { bg: palette.tileBlueBg, fg: palette.tileBlueFg },
  { bg: palette.tileGreenBg, fg: palette.tileGreenFg },
  { bg: palette.tileAmberBg, fg: palette.tileAmberFg },
  { bg: palette.tilePurpleBg, fg: palette.tilePurpleFg },
  { bg: palette.tileTealBg, fg: palette.tileTealFg },
] as const

export type TilePalette = (typeof tilePalettes)[number]

// 稳定散列：同一存储源的内部 key 永远拿到同一种砖色。
export function tileOf(key: string): TilePalette {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return tilePalettes[Math.abs(h) % tilePalettes.length]
}
