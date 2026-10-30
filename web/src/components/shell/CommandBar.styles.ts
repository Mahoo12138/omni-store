import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useStyles = makeStyles({
  root: {
    'display': 'flex',
    'alignItems': 'center',
    'flexWrap': 'nowrap',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalL),
    'backgroundColor': tokens.colorBrandBackground2,
    ...shorthands.borderWidth(tokens.strokeWidthThin),
    ...shorthands.borderStyle('solid'),
    ...shorthands.borderColor(tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    'color': tokens.colorNeutralForeground1,
    'minWidth': '0px',
    // 溢出管理器给隐藏项打的标记；不隐藏就会与可见按钮一起显示。
    '& [data-overflowing]': {
      display: 'none',
    },
  },
  copy: {
    'display': 'flex',
    'alignItems': 'baseline',
    'minWidth': '0px',
    ...shorthands.gap(tokens.spacingHorizontalS),
    'flexShrink': 1,
    ...shorthands.overflow('hidden'),
  },
  status: {
    'whiteSpace': 'nowrap',
  },
  hint: {
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase200,
    'whiteSpace': 'nowrap',
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
    [media.md]: {
      'display': 'none',
    },
  },
  actions: {
    'display': 'flex',
    'alignItems': 'center',
    'marginLeft': 'auto',
    'flexShrink': 0,
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
})
