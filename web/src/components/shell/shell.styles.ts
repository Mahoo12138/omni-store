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

  stateFill: {
  'minHeight': layout.stateMinHeight,
  'display': 'flex',
  'flexDirection': 'column',
  'alignItems': 'center',
  'justifyContent': 'center',
  'gap': tokens.spacingVerticalS,
  ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalXXL),
  },
  stateBlock: {
  'display': 'grid',
  'justifyItems': 'center',
  'gap': tokens.spacingVerticalXS,
  ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalL),
  'backgroundColor': tokens.colorNeutralBackground1,
  ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  ...shorthands.borderRadius(tokens.borderRadiusLarge),
  'textAlign': 'center',
  },
  stateInline: {
  'minWidth': '0px',
  },
  stateTitle: {
  'color': tokens.colorNeutralForeground1,
  ...shorthands.margin('0px'),
  },
  stateDescription: {
  'color': tokens.colorNeutralForeground2,
  'maxWidth': '52ch',
  'lineHeight': tokens.lineHeightBase400,
  ...shorthands.margin('0px'),
  },
  stateActions: {
  'display': 'flex',
  'flexWrap': 'wrap',
  'justifyContent': 'center',
  'gap': tokens.spacingHorizontalS,
  'marginTop': tokens.spacingVerticalM,
  },
  stateIcon: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': '44px',
  'height': '44px',
  'color': tokens.colorBrandForeground1,
  'backgroundColor': tokens.colorBrandBackground2,
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
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
