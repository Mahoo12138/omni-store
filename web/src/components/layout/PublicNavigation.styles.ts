import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

// 公开侧导航：一条浅底链接行。原先为深色 hero 存在的 --pnav-* 双套变量（含 7 个
// rgba/#ffffff 字面量）已随 hero 一起废止，这里只用主题 token，深色主题可直接跟随。
export const useStyles = makeStyles({
  navigation: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'flex-end',
  'flexWrap': 'wrap',
  ...shorthands.gap(tokens.spacingHorizontalXXS),
  'minWidth': '0px',
  [media.lg]: {
    'flexBasis': '100%',
    'justifyContent': 'flex-start',
  },
  },
  link: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'gap': tokens.spacingHorizontalXXS,
  'minHeight': '32px',
  ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalMNudge),
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'color': tokens.colorNeutralForeground2,
  'fontSize': tokens.fontSizeBase300,
  'fontWeight': tokens.fontWeightSemibold,
  'lineHeight': tokens.lineHeightBase300,
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
  '&[aria-current="page"]': {
    'backgroundColor': tokens.colorBrandBackground2,
    'color': tokens.colorBrandForeground1,
  },
  '& svg': {
    'flexShrink': 0,
  },
  },
  accountPending: {
  'cursor': 'wait',
  },
})
