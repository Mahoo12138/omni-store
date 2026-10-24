import { makeStyles } from '@fluentui/react-components'

// Fluent Input 原生外观；这里只保留 label/hint 内联模式的布局。
export const useStyles = makeStyles({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    color: 'var(--colorNeutralForeground2)',
  },
  hint: {
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'var(--colorNeutralForeground2)',
  },
})
