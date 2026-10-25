import { makeStyles, shorthands } from '@fluentui/react-components'

// Fluent Dialog 原生观感;这里只有关闭按钮(absolute 于 surface 右上)与描述文本。
export const useStyles = makeStyles({
  close: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    ...shorthands.padding('0'),
    ...shorthands.border('none'),
    borderRadius: 'var(--borderRadiusMedium)',
    backgroundColor: 'transparent',
    color: 'var(--colorNeutralForeground2)',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'var(--colorNeutralBackground1Hover)',
      color: 'var(--colorNeutralForeground1)',
    },
    ':focus-visible': {
      outline: '2px solid var(--colorStrokeFocus2)',
      outlineOffset: '2px',
    },
  },

  description: {
    margin: '0',
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'var(--colorNeutralForeground2)',
    overflowWrap: 'anywhere',
  },
})
