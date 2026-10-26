import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'
import { layout } from '../../styles/layout'

// 应用外壳。观感对齐 Fluent Nav 的原生条目：40px 高、中性 hover、选中项加粗并带
// 4×20px 的 compound brand 指示条；窄屏切到底部导航条时同一指示条翻到条目上沿。
// 这里不套 Fluent `Nav` 组件：它的 root 槽不渲染 <nav>，条目也只接受字符串元素类型，
// 接不住 TanStack 的 <Link>（详见计划 §2a）。
export const useAppFrameStyles = makeStyles({
  root: {
  'display': 'flex',
  'minHeight': '100dvh',
  'backgroundColor': tokens.colorNeutralBackground2,
  [media.md]: {
    'flexDirection': 'column',
  },
  },
  sidebar: {
  'display': 'flex',
  'flexDirection': 'column',
  'width': layout.sidebarWidth,
  'flexShrink': 0,
  'position': 'sticky',
  'top': '0px',
  'height': '100dvh',
  'zIndex': layout.zIndexSidebar,
  'backgroundColor': tokens.colorNeutralBackground1,
  'borderInlineEndWidth': tokens.strokeWidthThin,
  'borderInlineEndStyle': 'solid',
  'borderInlineEndColor': tokens.colorNeutralStroke2,
  ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalL),
  [media.md]: {
    'width': '100%',
    'height': 'auto',
    'position': 'fixed',
    'insetInline': '0px',
    'insetBlockEnd': '0px',
    'insetBlockStart': 'auto',
    'flexDirection': 'row',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalXXS),
    'borderInlineEndStyle': 'none',
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.padding('6px', tokens.spacingHorizontalS, 'max(6px, env(safe-area-inset-bottom))'),
  },
  },
  brand: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalMNudge),
  ...shorthands.padding('2px', tokens.spacingHorizontalMNudge, tokens.spacingVerticalXXXL),
  'color': tokens.colorBrandForeground1,
  'fontSize': tokens.fontSizeBase400,
  'fontWeight': tokens.fontWeightBold,
  'letterSpacing': '-0.02em',
  'textDecoration': 'none',
  [media.md]: {
    'display': 'none',
  },
  },
  brandName: {
  'color': tokens.colorNeutralForeground1,
  },
  nav: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap(tokens.spacingHorizontalXXS),
  'minWidth': '0px',
  [media.md]: {
    'flexDirection': 'row',
    'flexGrow': 1,
    'flexShrink': 1,
    'minWidth': '0px',
    'overflowX': 'auto',
    'scrollbarWidth': 'none',
  },
  },
  navLabel: {
  ...shorthands.padding('0px', tokens.spacingHorizontalMNudge, tokens.spacingVerticalM),
  'color': tokens.colorNeutralForeground3,
  'fontSize': tokens.fontSizeBase200,
  'fontWeight': tokens.fontWeightSemibold,
  'letterSpacing': '0.06em',
  [media.md]: {
    'display': 'none',
  },
  },
  navItem: {
  'position': 'relative',
  'display': 'flex',
  'alignItems': 'center',
  'minHeight': '40px',
  ...shorthands.gap(tokens.spacingHorizontalMNudge),
  ...shorthands.padding(tokens.spacingVerticalMNudge, tokens.spacingHorizontalS, tokens.spacingVerticalMNudge, tokens.spacingHorizontalMNudge),
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase300,
  'fontWeight': tokens.fontWeightRegular,
  'whiteSpace': 'nowrap',
  'textDecoration': 'none',
  'transitionProperty': 'background-color, color',
  'transitionDuration': tokens.durationFast,
  'transitionTimingFunction': tokens.curveDecelerateMax,
  '&:hover': {
    'backgroundColor': tokens.colorNeutralBackground1Hover,
    'color': tokens.colorNeutralForeground1,
  },
  '&:focus-visible': {
    'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    'outlineOffset': '2px',
  },
  [media.md]: {
    'flex': '0 0 60px',
    'minHeight': layout.navRailHeight,
    'flexDirection': 'column',
    'justifyContent': 'center',
    ...shorthands.gap(tokens.spacingVerticalXXS),
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXXS),
    'fontSize': tokens.fontSizeBase200,
  },
  },
  navItemSelected: {
  'color': tokens.colorNeutralForeground1,
  'fontWeight': tokens.fontWeightSemibold,
  '::after': {
    'content': '""',
    'position': 'absolute',
    'insetInlineStart': `calc(-1 * ${tokens.spacingHorizontalL})`,
    'insetBlockStart': '50%',
    'width': '4px',
    'height': '20px',
    'transform': 'translateY(-50%)',
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    'backgroundColor': tokens.colorCompoundBrandForeground1,
  },
  [media.md]: {
    '::after': {
      'insetInlineStart': '50%',
      'insetBlockStart': '0px',
      'width': '20px',
      'height': '4px',
      'transform': 'translateX(-50%)',
    },
  },
  },
  sidebarSpacer: {
  'flexGrow': 1,
  [media.md]: {
    'display': 'none',
  },
  },
  content: {
  'display': 'flex',
  'flexDirection': 'column',
  'flexGrow': 1,
  'minWidth': '0px',
  [media.md]: {
    'paddingBlockEnd': 'calc(70px + env(safe-area-inset-bottom))',
  },
  },
  main: {
  'flexGrow': 1,
  'width': '100%',
  'maxWidth': layout.contentMaxWidth,
  ...shorthands.margin('0px', 'auto'),
  ...shorthands.padding(tokens.spacingVerticalXXXL, layout.pageGutter, '80px'),
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalXL, tokens.spacingVerticalXXXL),
  },
  [media.xs]: {
    ...shorthands.padding(tokens.spacingVerticalXL, tokens.spacingHorizontalL, tokens.spacingVerticalXXXL),
  },
  },
  mainWide: {
  'flexGrow': 1,
  'width': '100%',
  'maxWidth': layout.contentMaxWideWidth,
  ...shorthands.margin('0px', 'auto'),
  ...shorthands.padding(tokens.spacingVerticalXL, layout.pageGutterWide, tokens.spacingVerticalXXXL),
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalMNudge, tokens.spacingVerticalXXL),
  },
  },
  userArea: {
  'position': 'relative',
  'display': 'flex',
  'alignItems': 'center',
  'flexShrink': 0,
  'paddingBlockStart': tokens.spacingVerticalM,
  ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  [media.md]: {
    'paddingBlockStart': '0px',
    ...shorthands.borderTop('0px'),
  },
  },
  userButton: {
  'width': '100%',
  'justifyContent': 'flex-start',
  ...shorthands.padding(tokens.spacingVerticalXS),
  'color': tokens.colorNeutralForeground1,
  [media.md]: {
    'width': layout.navRailHeight,
    'minHeight': layout.navRailHeight,
    'justifyContent': 'center',
    ...shorthands.padding('0px'),
  },
  },
  userStack: {
  'display': 'grid',
  'justifyItems': 'start',
  'gap': tokens.spacingVerticalXXS,
  'minWidth': '0px',
  [media.md]: {
    'display': 'none',
  },
  },
  userChevron: {
  'flexShrink': 0,
  'color': tokens.colorNeutralForeground3,
  [media.md]: {
    'display': 'none',
  },
  },
  userCaption: {
  'display': 'block',
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase200,
  },
  userName: {
  'display': 'block',
  'maxWidth': '100%',
  ...shorthands.overflow('hidden'),
  'textAlign': 'start',
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  },
  loadingSidebar: {
  'width': layout.sidebarWidth,
  'flexShrink': 0,
  'backgroundColor': tokens.colorNeutralBackground1,
  'borderInlineEndWidth': tokens.strokeWidthThin,
  'borderInlineEndStyle': 'solid',
  'borderInlineEndColor': tokens.colorNeutralStroke2,
  [media.md]: {
    'width': '100%',
    'height': layout.navRailHeight,
  },
  },
  loadingContent: {
  'flexGrow': 1,
  ...shorthands.padding(tokens.spacingVerticalXXXL),
  },
})
