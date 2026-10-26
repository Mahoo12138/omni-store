import { makeStyles, shorthands } from '@fluentui/react-components'

// 网盘文件选择器（TransferStorePicker）专用。流转中心页头已迁到 shell/PageHeader；
// 原先的草稿/收件箱/提交卡片等 slot 是 markup 搬入 components/transfer 后的残留，已清除。
export const useStyles = makeStyles({
  breadcrumb: {
  'display': 'flex',
  'flexWrap': 'wrap',
  ...shorthands.gap('4px'),
  'marginBottom': '8px',
  'fontSize': '13px',
  },
  browserList: {
  'display': 'grid',
  ...shorthands.gap('4px'),
  'maxHeight': '300px',
  'overflowY': 'auto',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  ...shorthands.padding('8px'),
  },
  browserEmpty: {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  ...shorthands.padding('16px'),
  'textAlign': 'center',
  },
  browserRow: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  ...shorthands.padding('4px', '6px'),
  ...shorthands.borderRadius('var(--borderRadiusSmall)'),
  'fontSize': '13px',
  'color': 'var(--colorNeutralForeground1)',
  },
  browserDirButton: {
  ...shorthands.borderStyle('none'),
  'background': 'none',
  ...shorthands.padding('0px'),
  'cursor': 'pointer',
  'color': 'var(--colorBrandBackground)',
  'fontWeight': 600,
  'fontSize': '13px',
  },
  browserName: {
  'color': 'var(--colorNeutralForeground1)',
  },
})
