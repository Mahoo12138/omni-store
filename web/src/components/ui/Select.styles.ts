import { makeStyles, shorthands } from '@fluentui/react-components'

// Fluent Dropdown 触发器内容与宽度布局（触发器/弹层本体已迁移到 Fluent Dropdown）
export const useStyles = makeStyles({
  triggerWidthFull: { width: '100%' },
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
