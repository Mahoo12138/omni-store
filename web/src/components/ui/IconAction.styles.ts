import { makeStyles, shorthands, tokens } from '@fluentui/react-components'

// 表格操作列的图标按钮：统一 32px 命中区，悬停/聚焦由 Fluent Tooltip 解释语义。
export const useStyles = makeStyles({
  root: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': tokens.spacingHorizontalXXXL,
    'height': tokens.spacingHorizontalXXXL,
    'minWidth': '0px',
    ...shorthands.padding('0px'),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'backgroundColor': 'transparent',
    'color': tokens.colorNeutralForeground2,
    'textDecorationLine': 'none',
    'cursor': 'pointer',
    ':hover': {
      'backgroundColor': tokens.colorNeutralBackground1Hover,
      'color': tokens.colorNeutralForeground1,
    },
    ':focus-visible': {
      'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      'outlineOffset': '2px',
    },
    '&[data-danger]': {
      'color': tokens.colorPaletteRedForeground1,
    },
    '&[data-danger]:hover': {
      'backgroundColor': tokens.colorPaletteRedBackground1,
      'color': tokens.colorPaletteRedForeground1,
    },
    '&:disabled': {
      'color': tokens.colorNeutralForegroundDisabled,
      'cursor': 'not-allowed',
      'backgroundColor': 'transparent',
    },
  },
})
