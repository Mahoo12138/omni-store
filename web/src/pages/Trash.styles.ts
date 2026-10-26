import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../styles/media'

// TODO(人工复核):
// - action 组合本文件 actionBase:需把基类属性复制进来(仅 hover 态覆盖时,可只保留差异)
// - dangerAction 组合本文件 actionBase:需把基类属性复制进来(仅 hover 态覆盖时,可只保留差异)

export const useStyles = makeStyles({
  header: {
  'display': 'flex',
  'justifyContent': 'space-between',
  'alignItems': 'flex-end',
  ...shorthands.gap('24px'),
  'marginBottom': '28px',
  [media.sm]: {
    'alignItems': 'flex-start',
    'flexDirection': 'column',
  },
  },
  back: {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap('4px'),
  ...shorthands.borderWidth('0px'), ...shorthands.borderStyle('solid'),
  ...shorthands.padding('4px', '0'),
  'marginBottom': '14px',
  'background': 'transparent',
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  'cursor': 'pointer',
  '&:hover': {
    'color': 'var(--colorBrandBackground)',
  },
  '&:focus-visible': {
    'outline': `2px solid var(--colorBrandBackground)`,
    'outlineOffset': '3px',
  },
  },
  title: {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '32px',
  'lineHeight': 1.1,
  'letterSpacing': '-0.045em',
  },
  description: {
  ...shorthands.margin('10px', '0', '0'),
  'color': 'var(--colorNeutralForeground2)',
  'lineHeight': 1.6,
  },
  panel: {
  ...shorthands.overflow('hidden'),
  'minHeight': '260px',
  'background': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  'boxShadow': 'var(--shadow4)',
  },
  tableWrap: {
  'overflowX': 'auto',
  },
  table: {
  'width': '100%',
  'minWidth': '760px',
  'borderCollapse': 'collapse',
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '13px',
  [media.lg]: {
    'minWidth': '0px',
  },
  },
  nameCell: {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap('9px'),
  'minWidth': '0px',
  'fontWeight': 600,
  },
  pathCell: {
  'maxWidth': '300px',
  ...shorthands.overflow('hidden'),
  'color': 'var(--colorNeutralForeground2)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  [media.lg]: {
    'display': 'none',
  },
  },
  timeCell: {
  'whiteSpace': 'nowrap',
  [media.md]: {
    'display': 'none',
  },
  },
  sizeCell: {
  'whiteSpace': 'nowrap',
  [media.xs]: {
    'display': 'none',
  },
  },
  actions: {
  'display': 'flex',
  'justifyContent': 'flex-end',
  ...shorthands.gap('4px'),
  },
  action: {
'width': '32px',
  'height': '32px',
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.border(0),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'background': 'transparent',
  'cursor': 'pointer',
  ':focus-visible': {
    'outline': '2px solid var(--colorStrokeFocus2)',
    'outlineOffset': '1px',
  },
  'color': 'var(--colorBrandBackground)',
  '&:hover': {
    'backgroundColor': 'var(--colorBrandBackground2)',
  },
  },
  dangerAction: {
'width': '32px',
  'height': '32px',
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.border(0),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'background': 'transparent',
  'cursor': 'pointer',
  ':focus-visible': {
    'outline': '2px solid var(--colorStrokeFocus2)',
    'outlineOffset': '1px',
  },
  'color': 'var(--colorPaletteRedForeground1)',
  '&:hover': {
    'backgroundColor': 'var(--colorPaletteRedBackground1)',
  },
  },
  centerState: {
  'minHeight': '240px',
  'display': 'flex',
  'flexDirection': 'column',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.gap('16px'),
  ...shorthands.padding('40px'),
  'color': 'var(--colorNeutralForeground2)',
  'textAlign': 'center',
  },
  empty: {
  // TODO 未解析: [centerState]
  },
  emptyIcon: {
  'width': '54px',
  'height': '54px',
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'background': 'var(--colorNeutralBackground1Hover)',
  'color': 'var(--colorNeutralForeground2)',
  },
  dialogText: {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground2)',
  'lineHeight': 1.6,
  },
  dialogError: {
  ...shorthands.margin('0px'),
  'color': 'var(--colorPaletteRedForeground1)',
  'lineHeight': 1.6,
  },
})
