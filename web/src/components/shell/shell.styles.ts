import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'
import { layout } from '../../styles/layout'

// 骨架层共享度量。颜色/间距/圆角一律取 Fluent token；超过 32px 的结构性尺寸
// 只能来自 styles/layout.ts（Fluent 间距 token 的上限就是 32px）。
export const useShellStyles = makeStyles({
  pageHeader: {
  'display': 'grid',
  ...shorthands.gap(tokens.spacingVerticalXS),
  ...shorthands.margin('0px', '0px', tokens.spacingVerticalXXXL),
  'minWidth': '0px',
  // 设置类页面用 24px 标题，与内容之间也只留 24px。
  '&[data-compact]': {
    'marginBottom': tokens.spacingVerticalXXL,
  },
  },
  pageHeadline: {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'baseline',
  'justifyContent': 'space-between',
  'columnGap': tokens.spacingHorizontalXL,
  'rowGap': tokens.spacingVerticalS,
  'minWidth': '0px',
  [media.sm]: {
    'alignItems': 'flex-start',
    'flexDirection': 'column',
  },
  },
  pageEyebrow: {
  'color': tokens.colorBrandForeground1,
  'letterSpacing': '0.08em',
  },
  pageActions: {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  'gap': tokens.spacingHorizontalS,
  'flexShrink': 0,
  },
  pageDescription: {
  'color': tokens.colorNeutralForeground2,
  'maxWidth': layout.readingMaxWidth,
  'lineHeight': tokens.lineHeightBase400,
  },

  viewSwitcher: {
  'flexShrink': 0,
  'minWidth': '0px',
  },

  measure: {
  'width': '100%',
  'minWidth': '0px',
  ...shorthands.margin('0px', 'auto'),
  ...shorthands.padding('0px', layout.pageGutter),
  },
  measureReading: {
  'maxWidth': layout.readingMaxWidth,
  },
  measureDefault: {
  'maxWidth': layout.contentMaxWidth,
  },
  measureWide: {
  'maxWidth': layout.contentMaxWideWidth,
  },
  measureFluid: {
  'maxWidth': 'none',
  },

  // 页面级状态面：公开侧与工作台共用同一套版面。品牌色只做两层很轻的底：
  // 左上角极淡的品牌晕染 + 右侧等距立方体线稿（LogoMark 的几何母题）。
  // 语义色只留给底部状态点的 6px 圆点，正文保持中性前景，避免整块变红。
  stateSurface: {
  'position': 'relative',
  'display': 'grid',
  'minWidth': '0px',
  ...shorthands.padding(layout.statePadding),
  'backgroundColor': tokens.colorNeutralBackground1,
  'backgroundImage': `radial-gradient(120% 120% at 0% 0%, ${tokens.colorBrandBackground2} 0%, transparent 46%)`,
  ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  ...shorthands.borderRadius(tokens.borderRadiusXLarge),
  ...shorthands.overflow('hidden'),
  'textAlign': 'left',
  },
  stateFill: {
  'minHeight': layout.stateMinHeight,
  'alignContent': 'center',
  },
  // 公开侧状态面收在 960px 内居中：页头保持满幅，状态正文不至于横跨整张页面。
  stateSurfaceBranded: {
  'width': '100%',
  'maxWidth': layout.stateMaxWidth,
  ...shorthands.margin('0px', 'auto'),
  },
  stateBusy: {
  'minHeight': '128px',
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  },
  stateBrand: {
  'position': 'relative',
  'zIndex': 1,
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalMNudge),
  'marginBottom': tokens.spacingVerticalXL,
  'minWidth': '0px',
  },
  stateEyebrow: {
  'color': tokens.colorBrandForeground1,
  'letterSpacing': '0.08em',
  'whiteSpace': 'nowrap',
  },
  stateContent: {
  'position': 'relative',
  'zIndex': 1,
  'display': 'grid',
  'justifyItems': 'start',
  'minWidth': '0px',
  },
  // 品牌水印占住右侧一条固定栏，正文提前让位，宽屏不压字。
  stateContentBranded: {
  'paddingRight': layout.stateWatermarkWidth,
  [media.md]: {
    'paddingRight': '0px',
  },
  },
  stateWatermark: {
  'position': 'absolute',
  'zIndex': 0,
  'top': '50%',
  'right': '-12px',
  'width': layout.stateWatermarkWidth,
  'height': layout.stateWatermarkHeight,
  'transform': 'translateY(-50%)',
  // 品牌蓝在深浅两档都可读；淡出写在 SVG 的 stroke/fill opacity 上。
  // colorBrandStroke2 在深色下是 #0e4775，比状态面底色还暗，线稿会整个消失。
  'color': tokens.colorBrandStroke1,
  'pointerEvents': 'none',
  [media.md]: {
    'display': 'none',
  },
  },
  // 公开侧没有页头图标位，品牌行由 LogoMark + eyebrow 承担；
  // 工作台状态仍用 48px 图标砖建立视觉锚点。
  stateFooter: {
  'position': 'relative',
  'zIndex': 1,
  'display': 'flex',
  'alignItems': 'baseline',
  'justifyContent': 'space-between',
  'flexWrap': 'wrap',
  ...shorthands.gap(tokens.spacingHorizontalM, tokens.spacingHorizontalL),
  'marginTop': tokens.spacingVerticalXXXL,
  ...shorthands.padding(tokens.spacingVerticalL, '0px', '0px'),
  'borderBlockStartWidth': tokens.strokeWidthThin,
  'borderBlockStartStyle': 'solid',
  'borderBlockStartColor': tokens.colorNeutralStroke2,
  },
  stateStatus: {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalSNudge),
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase200,
  'lineHeight': tokens.lineHeightBase200,
  },
  stateStatusDot: {
  'width': '6px',
  'height': '6px',
  'flexShrink': 0,
  ...shorthands.borderRadius(tokens.borderRadiusCircular),
  'backgroundColor': tokens.colorNeutralForeground3,
  '&[data-tone="success"]': { backgroundColor: tokens.colorPaletteGreenForeground1 },
  '&[data-tone="warning"]': { backgroundColor: tokens.colorPaletteDarkOrangeForeground1 },
  '&[data-tone="error"]': { backgroundColor: tokens.colorPaletteRedForeground1 },
  '&[data-tone="pending"]': { backgroundColor: tokens.colorPaletteYellowForeground1 },
  },
  stateHint: {
  'color': tokens.colorNeutralForeground3,
  'fontSize': tokens.fontSizeBase200,
  'lineHeight': tokens.lineHeightBase200,
  'textAlign': 'right',
  'minWidth': '0px',
  [media.md]: {
    'textAlign': 'left',
  },
  },
  stateInline: {
  'minWidth': '0px',
  },
  // 卡片/表格内部的无边框空态：只做垂直呼吸与文字层级。
  statePlain: {
  'display': 'flex',
  'flexDirection': 'column',
  'alignItems': 'center',
  'justifyContent': 'center',
  'gap': '0px',
  'minHeight': '96px',
  ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalL),
  'textAlign': 'center',
  },
  statePlainTitle: {
  'color': tokens.colorNeutralForeground1,
  'fontSize': tokens.fontSizeBase300,
  'lineHeight': tokens.lineHeightBase300,
  'marginBottom': tokens.spacingVerticalXS,
  },
  statePlainText: {
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase200,
  'lineHeight': tokens.lineHeightBase300,
  'maxWidth': '52ch',
  'marginTop': '0px',
  },
  banner: {
  'minWidth': '0px',
  'overflowWrap': 'anywhere',
  },
  stateTitle: {
  'color': tokens.colorNeutralForeground1,
  'fontSize': tokens.fontSizeHero700,
  'lineHeight': tokens.lineHeightHero700,
  'fontWeight': tokens.fontWeightSemibold,
  'letterSpacing': '-0.02em',
  ...shorthands.margin('0px', '0px', tokens.spacingVerticalS),
  'maxWidth': '24ch',
  [media.sm]: {
    'fontSize': tokens.fontSizeBase600,
    'lineHeight': tokens.lineHeightBase600,
  },
  },
  stateDescription: {
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase300,
  'lineHeight': tokens.lineHeightBase400,
  'maxWidth': '62ch',
  ...shorthands.margin('0px'),
  },
  stateActions: {
  'display': 'flex',
  'flexWrap': 'wrap',
  'justifyContent': 'center',
  'gap': tokens.spacingHorizontalS,
  'marginTop': tokens.spacingVerticalXL,
  },
  stateActionsStart: {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  'justifyContent': 'flex-start',
  'gap': tokens.spacingHorizontalS,
  'marginTop': tokens.spacingVerticalXXL,
  },
  stateIcon: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': layout.stateIconSize,
  'height': layout.stateIconSize,
  'color': tokens.colorBrandForeground1,
  'backgroundColor': tokens.colorBrandBackground2,
  ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorBrandStroke2),
  ...shorthands.borderRadius(tokens.borderRadiusXLarge),
  'marginBottom': tokens.spacingVerticalXL,
  },

  skeletonRows: {
  'display': 'grid',
  ...shorthands.gap(tokens.spacingVerticalM),
  ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  skeletonRow: {
  'display': 'grid',
  'gridTemplateColumns': 'minmax(0, 3fr) minmax(0, 1fr)',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalL),
  },
  skeletonLine: {
  'width': '100%',
  },
  skeletonGrid: {
  'display': 'grid',
  'gridTemplateColumns': 'repeat(auto-fill, minmax(200px, 1fr))',
  ...shorthands.gap(tokens.spacingHorizontalL),
  [media.sm]: {
    'gridTemplateColumns': 'repeat(auto-fill, minmax(140px, 1fr))',
  },
  },
  skeletonCard: {
  'display': 'grid',
  ...shorthands.gap(tokens.spacingVerticalS),
  ...shorthands.padding(tokens.spacingVerticalL),
  },
  skeletonThumb: {
  'width': '100%',
  'aspectRatio': '4 / 3',
  },
})
