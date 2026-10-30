import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useStyles = makeStyles({
  toolbar: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  'marginBottom': '16px',
  },
  toolbarGroup: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  'flexWrap': 'wrap',
  },
  searchBox: {
  'position': 'relative',
  'display': 'inline-flex',
  'alignItems': 'center',
  },
  searchIcon: {
  'position': 'absolute',
  'left': '10px',
  'color': 'var(--colorNeutralForeground2)',
  'pointerEvents': 'none',
  'display': 'inline-flex',
  },
  searchInput: {
  'height': '36px',
  'width': '220px',
  ...shorthands.padding('0', '12px', '0', '34px'),
  'fontSize': '14px',
  'fontFamily': 'var(--fontFamilyBase)',
  'color': 'var(--colorNeutralForeground1)',
  'backgroundColor': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'outline': 'none',
  'transitionProperty': 'border-color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&::placeholder': {
    'color': 'var(--colorNeutralForeground2)',
  },
  '&:focus': {
    ...shorthands.borderColor('var(--colorBrandBackground)'),
  },
  [media.sm]: {
    'width': '150px',
  },
  },
  tableWrap: {
  'backgroundColor': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  'overflowX': 'auto',
  [media.lg]: {
    'overflowX': 'hidden',
  },
  },
  table: {
  'width': '100%',
  'borderCollapse': 'collapse',
  // Fluent Table 原生模式默认 table-layout:fixed；文件列表需要按内容自适应列宽。
  'tableLayout': 'auto',
  'fontSize': '14px',
  },
  th: {
  'textAlign': 'left',
  ...shorthands.padding('12px', '16px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontWeight': 500,
  'fontSize': '13px',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'whiteSpace': 'nowrap',
  [media.lg]: {
    // 窄屏行内名称单元格左右无内边距，表头跟随对齐。
    ...shorthands.padding('12px', '0px'),
  },
  },
  detailHeading: {
  'textAlign': 'left',
  ...shorthands.padding('12px', '16px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontWeight': 500,
  'fontSize': '13px',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'whiteSpace': 'nowrap',
  [media.lg]: {
    'display': 'none',
  },
  },
  selectionTh: {
  ...shorthands.padding('12px', '16px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontWeight': 500,
  'fontSize': '13px',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'whiteSpace': 'nowrap',
  'width': '42px',
  'paddingRight': '0px',
  'textAlign': 'center',
  [media.lg]: {
    'width': '44px',
    ...shorthands.padding('12px', '0px'),
  },
  },
  row: {
  'transitionProperty': 'background-color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:hover': {
    'backgroundColor': 'var(--colorNeutralBackground1Hover)',
  },
  },
  mobileRow: {
  [media.lg]: {
    'display': 'grid',
    // 名称 + 操作同处一行；操作不再被挤到第二行（那会溢出到下一行并挡住勾选框）。
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
  },
  },
  selectableRow: {
  [media.lg]: {
    'display': 'grid',
    'gridTemplateColumns': '44px minmax(0, 1fr) auto',
  },
  },
  dropTarget: {
  'backgroundColor': 'var(--colorBrandBackground2)',
  'outline': `2px solid var(--colorBrandBackground)`,
  'outlineOffset': '-2px',
  },
  td: {
  ...shorthands.padding('10px', '16px'),
  'whiteSpace': 'nowrap',
  'color': 'var(--colorNeutralForeground2)',
  },
  detailCell: {
  ...shorthands.padding('10px', '16px'),
  'whiteSpace': 'nowrap',
  'color': 'var(--colorNeutralForeground2)',
  [media.lg]: {
    'display': 'none',
  },
  },
  selectionCell: {
  ...shorthands.padding('10px', '16px'),
  'whiteSpace': 'nowrap',
  'color': 'var(--colorNeutralForeground2)',
  'width': '42px',
  'paddingRight': '0px',
  'textAlign': 'center',
  [media.lg]: {
    'width': '44px',
    // Fluent TableCell 的固定高度会打断栅格行的自适应高度，窄屏统一交还给内容。
    'height': 'auto',
    ...shorthands.padding('12px', '0px'),
  },
  },
  checkboxTarget: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'cursor': 'pointer',
  [media.lg]: {
    'width': '44px',
    'height': '44px',
  },
  },
  nameCell: {
  ...shorthands.padding('10px', '16px'),
  'whiteSpace': 'nowrap',
  'color': 'var(--colorNeutralForeground2)',
  [media.lg]: {
    'height': 'auto',
    ...shorthands.padding('12px', '0px'),
  },
  },
  mobileMeta: {
  'display': 'none',
  [media.lg]: {
    'display': 'block',
    ...shorthands.margin('6px', '0', '0', '32px'),
    'color': 'var(--colorNeutralForeground2)',
    'fontSize': '12px',
    'wordBreak': 'normal',
  },
  },
  nameInner: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('12px'),
  },
  nameLink: {
  'color': 'var(--colorNeutralForeground1)',
  'cursor': 'pointer',
  'background': 'none',
  ...shorthands.borderStyle('none'),
  ...shorthands.padding('0px'),
  'font': 'inherit',
  'textAlign': 'left',
  'transitionProperty': 'color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:hover': {
    'color': 'var(--colorBrandBackground)',
  },
  },
  nameStatic: {
  'color': 'var(--colorNeutralForeground1)',
  },
  nameMuted: {
  'color': 'var(--colorNeutralForeground2)',
  },
  actionsCell: {
  ...shorthands.padding('10px', '16px'),
  'whiteSpace': 'nowrap',
  'color': 'var(--colorNeutralForeground2)',
  [media.lg]: {
    // 窄屏栅格里 td 是栅格项，改为 flex 让操作图标在行高内垂直居中。
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'flex-end',
    'height': 'auto',
    ...shorthands.padding('12px', '0px'),
  },
  },
  actions: {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap('2px'),
  },
  actionBtn: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': '30px',
  'height': '30px',
  'background': 'none',
  ...shorthands.borderStyle('none'),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'color': 'var(--colorNeutralForeground2)',
  'cursor': 'pointer',
  'transitionProperty': 'background-color, color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:hover': {
    'backgroundColor': 'var(--colorBrandBackground2)',
    'color': 'var(--colorBrandBackground)',
  },
  [media.lg]: {
    'width': '44px',
    'height': '44px',
  },
  },
  actionBtnDanger: {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': '30px',
  'height': '30px',
  'background': 'none',
  ...shorthands.borderStyle('none'),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'color': 'var(--colorNeutralForeground2)',
  'cursor': 'pointer',
  'transitionProperty': 'background-color, color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:hover': {
    'backgroundColor': 'var(--colorBrandBackground2)',
    'color': 'var(--colorBrandBackground)',
  },
  [media.lg]: {
    'width': '44px',
    'height': '44px',
    ...shorthands.padding('12px', '0px'),
  },
  },
  skeletonRow: {
  'height': '14px',
  ...shorthands.margin('16px', '16px'),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'background': `linear-gradient(90deg, var(--colorNeutralBackground1Hover) 25%, var(--colorNeutralStroke2) 50%, var(--colorNeutralBackground1Hover) 75%)`,
  'backgroundSize': '200% 100%',
  'animation': `omnistore-shimmer 1.4s linear infinite`,
  },
  pager: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'flex-end',
  ...shorthands.gap('8px'),
  'marginTop': '16px',
  'fontSize': '13px',
  'color': 'var(--colorNeutralForeground2)',
  },
})
