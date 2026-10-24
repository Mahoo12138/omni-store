import { makeStyles, shorthands } from '@fluentui/react-components'

// 弹层外壳已迁移到 DialogWrap，这里只保留二维码与链接文本样式。
export const useStyles = makeStyles({
  qrWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'var(--colorNeutralBackground1)',
    ...shorthands.borderColor('var(--colorNeutralStroke2)'),
    ...shorthands.borderWidth('1px'),
    ...shorthands.borderStyle('solid'),
    borderRadius: 'var(--borderRadiusMedium)',
  },
  urlText: {
    margin: '24px 0 0',
    color: 'var(--colorNeutralForeground2)',
    fontSize: '12px',
    overflowWrap: 'anywhere',
  },
})
