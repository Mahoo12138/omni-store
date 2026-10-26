import { makeStyles, shorthands } from '@fluentui/react-components'

// ve 的 createVar 局部变量改为普通 CSS custom property:
// dark/light 容器负责注入 --pnav-* 变量,link 消费。
export const useStyles = makeStyles({
  navigation: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    ...shorthands.gap('6px'),
    minWidth: 0,
    '@media screen and (max-width: 980px)': {
      flexBasis: '100%',
      justifyContent: 'flex-start',
    },
  },

  dark: {
    // 深色 hero 上的导航:半透明白字面量(不可随主题中性层变成不透明)
    '--pnav-foreground': '#ffffff',
    '--pnav-border': 'rgba(255, 255, 255, 0.22)',
    '--pnav-background': 'rgba(255, 255, 255, 0.06)',
    '--pnav-hover-border': 'rgba(255, 255, 255, 0.42)',
    '--pnav-hover-background': 'rgba(255, 255, 255, 0.11)',
    '--pnav-selected-border': 'rgba(255, 255, 255, 0.65)',
    '--pnav-selected-background': 'rgba(255, 255, 255, 0.16)',
  },

  light: {
    '--pnav-foreground': 'var(--colorNeutralForeground1)',
    '--pnav-border': 'var(--colorNeutralStroke1)',
    '--pnav-background': 'var(--colorNeutralBackground1)',
    '--pnav-hover-border': 'var(--colorBrandBackground)',
    '--pnav-hover-background': 'var(--colorBrandBackground2)',
    '--pnav-selected-border': 'var(--colorBrandBackground)',
    '--pnav-selected-background': 'var(--colorBrandBackground2)',
  },

  link: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...shorthands.gap('6px'),
    height: '32px',
    ...shorthands.padding('0', '10px'),
    ...shorthands.border('1px', 'solid', 'var(--pnav-border)'),
    borderRadius: 'var(--borderRadiusSmall)',
    background: 'var(--pnav-background)',
    color: 'var(--pnav-foreground)',
    fontSize: '13px',
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    transition:
      'background-color var(--durationNormal) var(--curveDecelerateMax), border-color var(--durationNormal) var(--curveDecelerateMax)',
    ':hover': {
      background: 'var(--pnav-hover-background)',
      ...shorthands.borderColor('var(--pnav-hover-border)'),
    },
    '&[aria-current="page"]': {
      background: 'var(--pnav-selected-background)',
      ...shorthands.borderColor('var(--pnav-selected-border)'),
    },
    ':focus-visible': {
      outline: '2px solid var(--pnav-foreground)',
      outlineOffset: '3px',
    },
    '& svg': { flexShrink: 0 },
  },

  accountPending: { cursor: 'wait' },
})
