import { makeStyles } from '@fluentui/react-components'

// 弹窗 / 表单字段容器样式（label + 控件 + hint）。
// textarea/checkboxRow/grid2 等跨组件工具类见 Field.utils.ts（普通全局 CSS）。
export const useStyles = makeStyles({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--colorNeutralForeground1)',
  },
  hint: {
    fontSize: '12px',
    color: 'var(--colorNeutralForeground2)',
    minHeight: '1em',
  },
  hintError: {
    fontSize: '12px',
    color: 'var(--colorPaletteRedForeground1)',
    minHeight: '1em',
  },
})
