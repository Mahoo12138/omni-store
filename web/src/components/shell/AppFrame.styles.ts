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
  // 内容区是白色画布，导航栏退到灰底上（Fluent inline nav 的分层方式）。
  'backgroundColor': tokens.colorNeutralBackground1,
  [media.md]: {
    'flexDirection': 'column',
  },
  },
  sidebar: {
  'display': 'flex',
  'flexDirection': 'column',
  'width': layout.sidebarWidth,
  'flexShrink': 0,
  // 进入/离开设置页时窄栏收放有 1 帧过渡，避免整块版面跳一下。
  'transitionProperty': 'width',
  'transitionDuration': tokens.durationNormal,
  'transitionTimingFunction': tokens.curveDecelerateMax,
  'position': 'sticky',
  'top': '0px',
  'height': '100dvh',
  'zIndex': layout.zIndexSidebar,
  'backgroundColor': tokens.colorNeutralBackground3,
  'borderInlineEndWidth': tokens.strokeWidthThin,
  'borderInlineEndStyle': 'solid',
  'borderInlineEndColor': tokens.colorNeutralStroke2,
  // 底部留白交给账号区（userArea）自己分配，这里只留 12px 贴边。
  ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalL, tokens.spacingVerticalM),
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
  // 设置页：主侧栏收成图标窄栏。用属性选择器而不是第二个 class ——
  // 两个类都声明 width 时，谁生效取决于 Griffel 原子的插入顺序，不确定。
  '&[data-compact]': {
  'width': layout.navRailWidth,
  ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalXXS),
  },
  },
  // 设置页的窄栏态：只放图标，文字与分组标题不渲染（可访问名走 aria-label）。
  sidebarRail: {
  ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalXXS),
  'alignItems': 'stretch',
  // ≤820 侧栏变成底部条，窄栏的内边距必须退回与常规侧栏同一套值，
  // 否则桌面态那 32px 纵向留白会把底部条撑得很高。
  [media.md]: {
    ...shorthands.padding('6px', tokens.spacingHorizontalS, 'max(6px, env(safe-area-inset-bottom))'),
  },
  },
  brandRail: {
  'justifyContent': 'center',
  ...shorthands.padding('2px', '0px', tokens.spacingVerticalXXXL),
  },
  navItemRail: {
  'justifyContent': 'center',
  ...shorthands.padding(tokens.spacingVerticalMNudge, '0px'),
  },
  userButtonRail: {
  'justifyContent': 'center',
  ...shorthands.padding(tokens.spacingVerticalXS, '0px'),
  },
  // 窄栏 + 全出血内容区：留白由设置页自己的两栏负责，外壳不再加 padding。
  mainFlush: {
  'flexGrow': 1,
  'width': '100%',
  'maxWidth': 'none',
  ...shorthands.margin('0px'),
  // 桌面全出血（留白由设置页两栏自己给）；窄屏仍要常规页边距，
  // 因为这里替换的是 main，不是叠加在它上面。
  ...shorthands.padding('0px'),
  [media.md]: {
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalXL, tokens.spacingVerticalXXXL),
  },
  [media.xs]: {
    ...shorthands.padding(tokens.spacingVerticalXL, tokens.spacingHorizontalL, tokens.spacingVerticalXXXL),
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
  '&[data-compact]': {
  'justifyContent': 'center',
  ...shorthands.padding('2px', '0px', tokens.spacingVerticalXXXL),
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
  // Nav / NavItem 的外观（悬停底色、选中左条、字重、密度）全部交回 Fluent，
  // 这里只负责窄屏把竖排导航压成底部横条：布局走 root 槽，不穿透 .fui-* 类。
  navList: {
  // Fluent 的 sharedNavStyles 给每个 NavItem 打了 background-color: var(--colorNeutralBackground4)，
  // 在灰侧栏上会连成一整块灰板。这里只把这个 token 在导航作用域内改成透明，
  // 悬停（--colorNeutralBackground4Hover）与选中蓝条仍走库的原生值。
  '--colorNeutralBackground4': 'transparent',
  [media.md]: {
    'flexDirection': 'row',
    'flexWrap': 'nowrap',
    ...shorthands.gap(tokens.spacingHorizontalXXS),
    'width': '100%',
    ...shorthands.overflow('hidden'),
  },
  },
  navListItem: {
  [media.md]: {
    'flexDirection': 'column',
    'flex': '0 0 60px',
    'minHeight': layout.navRailHeight,
    'gap': tokens.spacingVerticalXXS,
    'fontSize': tokens.fontSizeBase200,
  },
  '&[data-compact]': {
  'justifyContent': 'center',
  ...shorthands.padding(tokens.spacingVerticalMNudge, '0px'),
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
  // 上下对称：账号块在「分隔线 → 视口底」这条带里垂直居中，
  // 而不是紧贴分隔线、下面空出一截。
  'paddingBlockStart': tokens.spacingVerticalL,
  'paddingBlockEnd': tokens.spacingVerticalL,
  ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  [media.md]: {
    'paddingBlockStart': '0px',
    'paddingBlockEnd': '0px',
    ...shorthands.borderTop('0px'),
  },
  },
  userButton: {
  'width': '100%',
  // Fluent Button 自带 min-width:96px：窄栏（56px）与底部导航条（52px）都放不下，
  // 常规侧栏里 width:100% 已经大于它，所以放在基槽里对三种形态都安全。
  'minWidth': '0px',
  'justifyContent': 'flex-start',
  ...shorthands.padding(tokens.spacingVerticalXS),
  'color': tokens.colorNeutralForeground1,
  [media.md]: {
    'width': layout.navRailHeight,
    'minHeight': layout.navRailHeight,
    // Fluent Button 自带 min-width:96px，窄屏导航条里会把账号格撑破，交回内容宽度。
    'minWidth': '0px',
    'justifyContent': 'center',
    ...shorthands.padding('0px'),
  },
  '&[data-compact]': {
  'justifyContent': 'center',
  // Fluent Button 自带 min-width:96px，窄栏只有 56px。
  'minWidth': '0px',
  ...shorthands.padding(tokens.spacingVerticalXS, '0px'),
  },
  },
  // Button 的 children 直接落在 root 上（Fluent 没有 content 槽），
  // 所以头像 / 两行文字 / 箭头的排布由这一行自己负责。
  userRow: {
  'display': 'flex',
  'alignItems': 'center',
  'gap': tokens.spacingHorizontalMNudge,
  'flexGrow': 1,
  'minWidth': '0px',
  'textAlign': 'start',
  // 窄栏里这一行只有头像，而它已经 flexGrow 撑满按钮，
  // 按钮自身的 justify-content 管不到行内 —— 必须在行内居中，
  // 否则头像会贴左边缘，与上方 logo / 导航图标错开约 8px。
  '&[data-compact]': {
    'justifyContent': 'center',
    'gap': '0px',
  },
  [media.md]: {
    'gap': '0px',
    'justifyContent': 'center',
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
  'marginInlineStart': 'auto',
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
