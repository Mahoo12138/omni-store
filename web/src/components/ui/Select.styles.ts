import { makeStyles, shorthands } from '@fluentui/react-components'

// Fluent Dropdown 触发器内容与宽度布局（触发器/弹层本体已迁移到 Fluent Dropdown）
export const useStyles = makeStyles({
  triggerInner: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  'minWidth': '0px',
  },
  // Fluent Dropdown 根节点自带 min-width:250px，不覆盖的话 width:100% 也缩不下去，
  // 窄屏（320px）会把页面顶出横向滚动。
  triggerWidthFull: { width: '100%', minWidth: '0px' },
  triggerWidthContent: { width: 'max-content', minWidth: '118px' },
  triggerWidthWide: { width: 'max-content', minWidth: '190px' },

  leadingIcon: {
    width: '34px',
    height: '34px',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    color: 'var(--colorBrandForeground1)',
    backgroundColor: 'var(--colorBrandBackground2)',
    borderRadius: 'var(--borderRadiusMedium)',
  },
  leadingIconPlain: {
    width: '20px',
    height: '20px',
    color: 'var(--colorNeutralForeground2)',
    backgroundColor: 'transparent',
    ...shorthands.borderRadius(0),
  },

  value: {
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },

  placeholder: { color: 'var(--colorNeutralForeground2)' },
})
