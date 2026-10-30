import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'
import { layout } from '../../styles/layout'

export const useStyles = makeStyles({
  'settingsContent': {
  'minWidth': '0px',
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap(tokens.spacingVerticalXXL),
  ...shorthands.padding(tokens.spacingVerticalXXXL, layout.pageGutter, '72px'),
  [media.xl]: {
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalXL, '96px'),
  },
  },
  'settingsGroupTitle': {
  ...shorthands.padding('2px', '12px', '6px'),
  'fontSize': '11px',
  'fontWeight': 600,
  'color': 'var(--colorNeutralForeground2)',
  'textTransform': 'uppercase',
  'letterSpacing': '0.08em',
  'userSelect': 'none',
  [media.xl]: {
    'display': 'none',
  },
  },
  // 全出血两栏：主侧栏收成窄栏后，分组面板紧贴它，内容区自己管留白。
  'settingsLayout': {
  'display': 'grid',
  'gridTemplateColumns': `${layout.settingsPaneWidth} minmax(0, 1fr)`,
  'gap': '0px',
  'alignItems': 'stretch',
  'minHeight': '100dvh',
  [media.xl]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
    'minHeight': 'auto',
  },
  },
  'settingsSide': {
  // 与窄栏同高的一整列：贴住主侧栏，版本信息沉到底部。
  'position': 'sticky',
  'top': '0px',
  'alignSelf': 'start',
  'display': 'flex',
  'flexDirection': 'column',
  'height': '100dvh',
  'overflowY': 'auto',
  ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalM),
  'background': 'var(--colorNeutralBackground2)',
  'borderInlineEndWidth': tokens.strokeWidthThin,
  'borderInlineEndStyle': 'solid',
  'borderInlineEndColor': 'var(--colorNeutralStroke2)',
  // 同主侧栏：把 NavItem 的库底色改透明，选中仍靠蓝条 + 加粗表达。
  '--colorNeutralBackground4': 'transparent',
  'fontSize': '13px',
  // 窄屏改用页头下方的横向胶囊栏；竖栏整体隐藏，避免成为一道纵向长列表。
  [media.xl]: {
    'display': 'none',
  },
  },
  // 窄屏分区切换：一排可横向滚动的胶囊，选中用品牌色底，分组之间留发丝分隔。
  'settingsCompactNav': {
  'display': 'none',
  [media.xl]: {
    'display': 'flex',
    'alignItems': 'center',
    'flexWrap': 'nowrap',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    ...shorthands.padding(tokens.spacingVerticalXS),
    'minWidth': '0px',
    // 宽档时胶囊栏贴住内容长度，不铺成一条空横条；窄档再吃满可用宽度滚动。
    'width': 'fit-content',
    'maxWidth': '100%',
    'boxSizing': 'border-box',
    'alignSelf': 'flex-start',
    'overflowX': 'auto',
    'overscrollBehaviorX': 'contain',
    'scrollbarWidth': 'none',
    'backgroundColor': tokens.colorNeutralBackground2,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    '&::-webkit-scrollbar': {
      'display': 'none',
    },
  },
  },
  'settingsCompactItem': {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalS),
  'flexShrink': 0,
  'height': tokens.spacingHorizontalXXXL,
  ...shorthands.padding('0px', tokens.spacingHorizontalMNudge),
  ...shorthands.borderWidth('0px'),
  ...shorthands.borderStyle('solid'),
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': 'transparent',
  'color': tokens.colorNeutralForeground2,
  'fontFamily': 'inherit',
  'fontSize': tokens.fontSizeBase300,
  'lineHeight': tokens.lineHeightBase300,
  'fontWeight': tokens.fontWeightRegular,
  'whiteSpace': 'nowrap',
  'cursor': 'pointer',
  'transitionProperty': 'background-color, color',
  'transitionDuration': tokens.durationFaster,
  ':hover': {
    'backgroundColor': tokens.colorNeutralBackground1Hover,
    'color': tokens.colorNeutralForeground1,
  },
  ':focus-visible': {
    'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    'outlineOffset': '2px',
  },
  '&[aria-current="page"]': {
    'backgroundColor': tokens.colorBrandBackground2,
    'color': tokens.colorBrandForeground2,
    'fontWeight': tokens.fontWeightSemibold,
  },
  },
  'settingsCompactIcon': {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'color': 'inherit',
  },
  'settingsCompactDivider': {
  'width': tokens.strokeWidthThin,
  'height': tokens.spacingHorizontalL,
  'flexShrink': 0,
  'backgroundColor': tokens.colorNeutralStroke2,
  ...shorthands.margin('0px', tokens.spacingHorizontalXS),
  },
})
