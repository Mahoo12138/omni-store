import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components'
import { fontStacks, palette } from './palette'

// Fluent UI v9 主题：品牌 ramp 由松柏绿按 oklch 明度插值生成。
// ramp 锚点：80=主色、70=hover、60=active/pressed、150=subtle 底色——与 palette.ts 的
// primary/primaryHover/primaryActive/primarySubtle 一一对应。暗色主题预留（createDarkTheme）。
const oklch = (l: number, c: number, h = 175) => `oklch(${l} ${c} ${h})`

export const brand: BrandVariants = {
  10: oklch(0.11, 0.02),
  20: oklch(0.15, 0.03),
  30: oklch(0.19, 0.042),
  40: oklch(0.24, 0.052),
  50: oklch(0.28, 0.06),
  60: oklch(0.32, 0.065),
  70: oklch(0.37, 0.07),
  80: oklch(0.43, 0.075),
  90: oklch(0.52, 0.07),
  100: oklch(0.62, 0.055),
  110: oklch(0.72, 0.045),
  120: oklch(0.82, 0.032),
  130: oklch(0.88, 0.025),
  140: oklch(0.92, 0.022),
  150: oklch(0.95, 0.018),
  160: oklch(0.97, 0.012),
}

// 覆盖 Fluent 中性层 token，对齐 palette.ts 的暖纸色/文字/边框/字体/圆角/阴影，
// 让 Fluent 组件与自研组件观感一致。语义色（success/danger/warning）按组件迁移时再精调。
export const appLightTheme: Theme = {
  ...createLightTheme(brand),
  fontFamilyBase: fontStacks.body,
  fontFamilyMonospace: fontStacks.mono,

  colorBrandForeground1: palette.primarySubtleInk,
  colorBrandForeground2: palette.primarySubtleInk,

  colorNeutralBackground1: palette.background,
  colorNeutralBackground2: palette.surface,
  colorNeutralBackground3: palette.surfaceHover,
  colorNeutralBackground1Hover: palette.surfaceHover,
  colorNeutralBackground1Pressed: palette.surfaceHover,
  colorNeutralBackgroundDisabled: palette.surfaceHover,

  colorNeutralForeground1: palette.text,
  colorNeutralForeground2: palette.textSecondary,
  colorNeutralForeground3: palette.textSecondary,
  colorNeutralForegroundOnBrand: palette.textOnPrimary,
  colorNeutralForegroundDisabled: palette.borderStrong,

  colorNeutralStroke1: palette.borderStrong,
  colorNeutralStroke2: palette.border,
  colorNeutralStroke3: palette.border,
  colorNeutralStrokeAccessible: palette.borderStrong,
  colorNeutralStrokeDisabled: palette.border,

  borderRadiusSmall: '5px',
  borderRadiusMedium: '10px',
  borderRadiusLarge: '18px',
  borderRadiusXLarge: '18px',

  shadow4: '0 1px 2px oklch(0.25 0.018 170 / 0.035)',
  shadow8: '0 1px 2px oklch(0.25 0.018 170 / 0.035)',
  shadow16: '0 18px 48px oklch(0.25 0.018 170 / 0.09)',
  shadow28: '0 18px 48px oklch(0.25 0.018 170 / 0.09)',
  shadow64: '0 18px 48px oklch(0.25 0.018 170 / 0.09)',
}

// 暗色主题占位：切换时用 createDarkTheme(brand) + 暖纸色暗值覆盖，砖色/预览层需补暗值。
