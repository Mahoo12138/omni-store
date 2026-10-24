import { createGlobalTheme } from '@vanilla-extract/css'
import { palette } from './palette'

// 设计 token 桥接层：ve 侧样式的 token 值直接绑定 Fluent 主题的 CSS 变量，
// 由 FluentProvider 注入的 webLightTheme 统一驱动（颜色/圆角/阴影/字体随主题走）。
// 图标砖等业务专属色保留原值（palette.ts），与主题无关。
// 此文件将随 VE → griffel 迁移逐步退役，届时页面样式直接引用 tokens。
export const vars = createGlobalTheme(':root', {
  color: {
    primary: 'var(--colorBrandBackground)',
    primaryHover: 'var(--colorBrandBackgroundHover)',
    primaryActive: 'var(--colorBrandBackgroundPressed)',
    primarySubtle: 'var(--colorBrandBackground2)',
    primarySubtleInk: 'var(--colorBrandForeground1)',

    background: 'var(--colorNeutralBackground2)',
    surface: 'var(--colorNeutralBackground1)',
    surfaceHover: 'var(--colorNeutralBackground1Hover)',
    border: 'var(--colorNeutralStroke2)',
    borderStrong: 'var(--colorNeutralStroke1)',

    text: 'var(--colorNeutralForeground1)',
    textSecondary: 'var(--colorNeutralForeground2)',
    textOnPrimary: 'var(--colorNeutralForegroundOnBrand)',

    success: 'var(--colorPaletteGreenForeground1)',
    successSubtle: 'var(--colorPaletteGreenBackground1)',
    danger: 'var(--colorPaletteRedForeground1)',
    dangerHover: 'var(--colorPaletteRedForeground1)',
    dangerSubtle: 'var(--colorPaletteRedBackground1)',
    warning: 'var(--colorPaletteYellowForeground1)',

    // 图标砖成对色：识别实体用，不做装饰（业务资产，不随主题）
    tileBlueBg: palette.tileBlueBg,
    tileBlueFg: palette.tileBlueFg,
    tileGreenBg: palette.tileGreenBg,
    tileGreenFg: palette.tileGreenFg,
    tileAmberBg: palette.tileAmberBg,
    tileAmberFg: palette.tileAmberFg,
    tilePurpleBg: palette.tilePurpleBg,
    tilePurpleFg: palette.tilePurpleFg,
    tileTealBg: palette.tileTealBg,
    tileTealFg: palette.tileTealFg,
    tileRedBg: palette.tileRedBg,
    tileRedFg: palette.tileRedFg,
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: 'var(--borderRadiusSmall)',
    md: 'var(--borderRadiusMedium)',
    lg: 'var(--borderRadiusLarge)',
    tile: 'var(--borderRadiusMedium)',
    full: '999px',
  },
  shadow: {
    sm: 'var(--shadow4)',
    md: 'var(--shadow16)',
  },
  fontSize: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    display: '32px',
  },
  font: {
    body: 'var(--fontFamilyBase)',
    mono: 'var(--fontFamilyMonospace)',
  },
  zIndex: {
    dropdown: '10',
    sticky: '20',
    backdrop: '30',
    modal: '40',
    toast: '50',
  },
  motion: {
    fast: 'var(--durationNormal)',
    base: 'var(--durationSlower)',
    ease: 'var(--curveDecelerateMax)',
  },
})
