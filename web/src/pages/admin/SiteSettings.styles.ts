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
  facts: {
  ...shorthands.margin('0px'),
  'display': 'grid',
  ...shorthands.gap('16px'),
  },
})
