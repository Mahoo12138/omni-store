import { makeStyles, shorthands } from '@fluentui/react-components'

// 文件管理器的弹窗正文：说明、清单与批量分享结果区。
export const useStyles = makeStyles({
  dialogHint: {
    ...shorthands.margin('0px'),
    'color': 'var(--colorNeutralForeground2)',
    'fontSize': '13px',
    'lineHeight': 1.6,
  },
  dialogText: {
    ...shorthands.margin('0px', '0px', '10px'),
    'color': 'var(--colorNeutralForeground1)',
    'fontSize': '13px',
    'lineHeight': 1.6,
  },
  dialogList: {
    ...shorthands.margin('0px'),
    'paddingLeft': '20px',
    'color': 'var(--colorNeutralForeground2)',
    'fontSize': '13px',
    'lineHeight': 1.6,
  },
  shareResult: {
    'maxHeight': 'min(45vh, 360px)',
    ...shorthands.overflow('auto'),
    'fontSize': '13px',
  },
  shareList: {
    'paddingLeft': '20px',
    'lineHeight': 1.6,
  },
  shareErrorList: {
    'color': 'var(--colorPaletteRedForeground1)',
  },
})
