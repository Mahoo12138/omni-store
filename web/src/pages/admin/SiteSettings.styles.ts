import { makeStyles, shorthands, tokens } from '@fluentui/react-components'

export const useStyles = makeStyles({
  root: {
  'minWidth': '0px',
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  },
  // 间距由外层容器负责：TabList 与 Tabs.Panel 都不再被注入外观，
  // 因此 Fluent tab 保持默认下划线观感，panel 的 hidden 也不会被 display 打败。
  tabs: {
  'minWidth': '0px',
  'display': 'grid',
  ...shorthands.gap(tokens.spacingVerticalXXL),
  },
  panelBody: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap(tokens.spacingVerticalXXL),
  'minWidth': '0px',
  },
  source: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'minWidth': '0px',
  'overflowWrap': 'anywhere',
  },
  path: {
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '12px',
  'color': 'var(--colorNeutralForeground2)',
  'overflowWrap': 'anywhere',
  },
  featureGroup: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('8px'),
  'paddingTop': '16px',
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  },
  featureRow: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  ...shorthands.gap('16px'),
  'flexWrap': 'wrap',
  },
  hint: {
  ...shorthands.margin('0px'),
  'fontSize': '13px',
  'lineHeight': 1.6,
  'color': 'var(--colorNeutralForeground2)',
  'overflowWrap': 'anywhere',
  },
  // 服务卡头部：图标 + 名称/状态 + 描述，操作在右。
  serviceHeader: {
  'display': 'flex',
  'alignItems': 'flex-start',
  'gap': tokens.spacingHorizontalM,
  ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalXL),
  'borderBottomWidth': tokens.strokeWidthThin,
  'borderBottomStyle': 'solid',
  'borderBottomColor': tokens.colorNeutralStroke2,
  },
  serviceIcon: {
  'display': 'grid',
  'placeItems': 'center',
  'width': tokens.spacingHorizontalXXXL,
  'height': tokens.spacingHorizontalXXXL,
  'flexShrink': 0,
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': tokens.colorNeutralBackground3,
  'color': tokens.colorNeutralForeground2,
  },
  serviceCopy: {
  'minWidth': '0px',
  'flexGrow': 1,
  },
  serviceTitleRow: {
  'display': 'flex',
  'alignItems': 'center',
  'flexWrap': 'wrap',
  'gap': tokens.spacingHorizontalS,
  'minWidth': '0px',
  },
  serviceBody: {
  'display': 'flex',
  'flexDirection': 'column',
  'gap': tokens.spacingVerticalM,
  ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalXL),
  },
  // 键值行：标签固定宽度在左，值在右（长路径落在值列内换行）。
  facts: {
  ...shorthands.margin('0px'),
  'display': 'grid',
  'gap': tokens.spacingVerticalS,
  '& > div': {
    'display': 'grid',
    'gridTemplateColumns': '72px minmax(0, 1fr)',
    'columnGap': tokens.spacingHorizontalM,
    'alignItems': 'baseline',
  },
  '& dt': {
    'color': tokens.colorNeutralForeground3,
    'fontSize': tokens.fontSizeBase200,
  },
  '& dd': {
    ...shorthands.margin('0px'),
    'minWidth': '0px',
  },
  },
})
