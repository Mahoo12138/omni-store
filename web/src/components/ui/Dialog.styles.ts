import { makeStyles, shorthands } from '@fluentui/react-components'

// 自研 Dialog 的面板/头部/主体/底栏样式；zIndex 由组件按嵌套深度内联计算。
export const useStyles = makeStyles({
  viewport: {
    position: 'fixed',
    ...shorthands.inset(0),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backdrop: {
    position: 'fixed',
    ...shorthands.inset(0),
    backgroundColor: 'oklch(0.2 0.02 262 / 0.45)',
    backdropFilter: 'blur(2px)',
  },

  popup: {
    position: 'relative',
    zIndex: 0,
    width: 'min(480px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--colorNeutralBackground1)',
    ...shorthands.borderColor('var(--colorNeutralStroke2)'),
    ...shorthands.borderWidth('1px'),
    ...shorthands.borderStyle('solid'),
    borderRadius: 'var(--borderRadiusLarge)',
    boxShadow: 'var(--shadow16)',
    outline: 'none',
  },
  // 弹窗变体：宽版本（用于编辑复杂表单）
  popupWide: {
    position: 'relative',
    zIndex: 0,
    width: 'min(640px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--colorNeutralBackground1)',
    ...shorthands.borderColor('var(--colorNeutralStroke2)'),
    ...shorthands.borderWidth('1px'),
    ...shorthands.borderStyle('solid'),
    borderRadius: 'var(--borderRadiusLarge)',
    boxShadow: 'var(--shadow16)',
    outline: 'none',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    ...shorthands.padding('16px', '24px'),
    ...shorthands.borderBottom('1px', 'solid', 'var(--colorNeutralStroke2)'),
    flexShrink: 0,
    '& > div': { minWidth: 0 },
  },

  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--colorNeutralForeground1)',
    overflowWrap: 'anywhere',
  },

  description: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--colorNeutralForeground2)',
  },

  close: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    flexShrink: 0,
    ...shorthands.padding(0),
    ...shorthands.borderStyle('none'),
    borderRadius: 'var(--borderRadiusMedium)',
    backgroundColor: 'transparent',
    color: 'var(--colorNeutralForeground2)',
    cursor: 'pointer',
    transition:
      'background-color var(--durationNormal) var(--curveDecelerateMax), color var(--durationNormal) var(--curveDecelerateMax)',
    ':hover': {
      backgroundColor: 'var(--colorNeutralBackground1Hover)',
      color: 'var(--colorNeutralForeground1)',
    },
    ':focus-visible': {
      outline: '2px solid var(--colorStrokeFocus2)',
      outlineOffset: '2px',
    },
  },

  body: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    minHeight: 0,
  },

  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    ...shorthands.padding('16px', '24px'),
    ...shorthands.borderTop('1px', 'solid', 'var(--colorNeutralStroke2)'),
    flexShrink: 0,
  },
})
