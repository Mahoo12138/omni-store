import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'
import { layout } from '../../styles/layout'

// 公开侧统一外壳：一条浅底顶栏（品牌 + 导航）+ 满幅内容 + 页脚。
// 原先的深色 masthead / hero / 浮起白卡体系已废止——那套靠
// var(--colorNeutralForeground1) 当背景实现，接上深色主题会直接反转成白板。
export const usePublicFrameStyles = makeStyles({
  root: {
  'display': 'flex',
  'flexDirection': 'column',
  'minHeight': '100dvh',
  'backgroundColor': tokens.colorNeutralBackground2,
  },
  topBar: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  'flexWrap': 'wrap',
  'columnGap': tokens.spacingHorizontalXL,
  'rowGap': tokens.spacingHorizontalS,
  ...shorthands.padding(tokens.spacingVerticalL, layout.pageGutter),
  'backgroundColor': tokens.colorNeutralBackground1,
  'borderBlockStartWidth': tokens.strokeWidthThick,
  'borderBlockStartStyle': 'solid',
  'borderBlockStartColor': tokens.colorCompoundBrandBackground,
  'borderBlockEndWidth': tokens.strokeWidthThin,
  'borderBlockEndStyle': 'solid',
  'borderBlockEndColor': tokens.colorNeutralStroke2,
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
  },
  },
  brand: {
  'display': 'flex',
  'alignItems': 'center',
  'gap': tokens.spacingHorizontalMNudge,
  'maxWidth': '100%',
  'minWidth': '0px',
  'color': tokens.colorBrandForeground1,
  'fontSize': tokens.fontSizeBase400,
  'fontWeight': tokens.fontWeightBold,
  'letterSpacing': '-0.02em',
  'textDecoration': 'none',
  // 品牌名很长时（实例名可达数十字）flex 会把 logo 一起压扁，logo 必须不参与收缩。
  '& svg': {
    'flexShrink': 0,
  },
  },
  brandName: {
  'color': tokens.colorNeutralForeground1,
  'minWidth': '0px',
  ...shorthands.overflow('hidden'),
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  },
  main: {
  'display': 'flex',
  'flexDirection': 'column',
  'flexGrow': 1,
  'width': '100%',
  'maxWidth': layout.contentMaxWidth,
  'minWidth': '0px',
  ...shorthands.margin('0px', 'auto'),
  ...shorthands.padding(tokens.spacingVerticalXXL, layout.pageGutter),
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  },
  footer: {
  ...shorthands.padding(tokens.spacingVerticalL, layout.pageGutter),
  'color': tokens.colorNeutralForeground3,
  'fontSize': tokens.fontSizeBase200,
  'backgroundColor': tokens.colorNeutralBackground1,
  'borderBlockStartWidth': tokens.strokeWidthThin,
  'borderBlockStartStyle': 'solid',
  'borderBlockStartColor': tokens.colorNeutralStroke2,
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
  },
  },
  footerLink: {
  'color': tokens.colorBrandForeground1,
  'textDecoration': 'none',
  '&:hover': {
    'textDecoration': 'underline',
  },
  },
})
