import { makeStyles } from '@fluentui/react-components'

// Fluent Dialog 原生观感;这里只有关闭按钮(absolute 于 surface 右上)与描述文本。
export const useStyles = makeStyles({
  // 关闭按钮的外观（含 hover/focus/圆角）由 Fluent Button 负责，
  // 这里只负责把它钉在弹窗右上角。
  close: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: 1,
  },

  description: {
    margin: '0',
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'var(--colorNeutralForeground2)',
    overflowWrap: 'anywhere',
  },
  // Fluent DialogActions 默认左对齐；底部操作区靠右是本产品的约定。
  'actions': {
  'justifyContent': 'flex-end',
  },
})
