import { makeStyles, shorthands } from '@fluentui/react-components'

// TODO(人工复核):
// - tabList 组合跨文件基类 outlineList
// - tabList 组合本文件 outlineList:需把基类属性复制进来(仅 hover 态覆盖时,可只保留差异)
// - tab 组合跨文件基类 outlineTab
// - tab 组合本文件 outlineTab:需把基类属性复制进来(仅 hover 态覆盖时,可只保留差异)

export const useStyles = makeStyles({
  root: {
  'minWidth': '0px',
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  },
  tabs: {
  'minWidth': '0px',
  },
  tabList: {
  'marginBottom': '24px',
  },
  tab: {
  'minHeight': '44px',
  'fontSize': '14px',
  },
  panel: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('24px'),
  'minWidth': '0px',
  '&[hidden]': {
    'display': 'none',
  },
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
  error: {
  'fontSize': '13px',
  'lineHeight': 1.6,
  'color': 'var(--colorPaletteRedForeground1)',
  'overflowWrap': 'anywhere',
  },
  message: {
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
