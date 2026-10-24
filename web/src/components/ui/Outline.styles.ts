import { makeStyles, shorthands } from '@fluentui/react-components'

// 项目内的标签页和视图切换统一使用的 outline 外观基类
//（griffel 版：由消费方经 mergeClasses 组合变体）。
export const useStyles = makeStyles({
  outlineList: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },

  outlineTab: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.gap('4px'),
    minHeight: '36px',
    ...shorthands.padding('0', '16px'),
    ...shorthands.border('1px', 'solid', 'var(--colorNeutralStroke2)'),
    borderRadius: 'var(--borderRadiusMedium)',
    backgroundColor: 'var(--colorNeutralBackground1)',
    color: 'var(--colorNeutralForeground2)',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition:
      'border-color var(--durationNormal) var(--curveDecelerateMax), color var(--durationNormal) var(--curveDecelerateMax), background-color var(--durationNormal) var(--curveDecelerateMax)',
    '&[data-active], &[aria-selected="true"], &[aria-pressed="true"]': {
      ...shorthands.borderColor('var(--colorBrandBackground)'),
      backgroundColor: 'var(--colorBrandBackground2)',
      color: 'var(--colorBrandForeground1)',
    },
    ':hover:not(:disabled)': {
      ...shorthands.borderColor('var(--colorBrandBackground)'),
      color: 'var(--colorBrandForeground1)',
    },
    ':focus-visible': {
      outline: '2px solid var(--colorStrokeFocus2)',
      outlineOffset: '2px',
    },
    ':disabled': { opacity: 0.45, cursor: 'not-allowed' },
    '@media screen and (max-width: 820px)': { minHeight: '44px' },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  },

  outlineIconTab: {
    width: '36px',
    ...shorthands.padding(0),
    '@media screen and (max-width: 820px)': { width: '44px' },
  },
})
