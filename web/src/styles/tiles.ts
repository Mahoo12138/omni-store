import { vars } from './theme.css'

// 图标砖配色对：识别实体（存储源、快速操作），不做装饰。
export const tilePalettes = [
  { bg: vars.color.tileBlueBg, fg: vars.color.tileBlueFg },
  { bg: vars.color.tileGreenBg, fg: vars.color.tileGreenFg },
  { bg: vars.color.tileAmberBg, fg: vars.color.tileAmberFg },
  { bg: vars.color.tilePurpleBg, fg: vars.color.tilePurpleFg },
  { bg: vars.color.tileTealBg, fg: vars.color.tileTealFg },
] as const

export type TilePalette = (typeof tilePalettes)[number]

// 稳定散列：同一 source_id 永远拿到同一种砖色。
export function tileOf(key: string): TilePalette {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return tilePalettes[Math.abs(h) % tilePalettes.length]
}
