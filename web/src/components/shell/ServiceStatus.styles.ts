import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

// 32px 高的状态胶囊：与公开导航的链接、按钮同高，放在 PageHeader 右侧时不改变行高。
export const useStyles = makeStyles({
  root: {
    'display': 'inline-flex',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    'height': '32px',
    'minWidth': '0px',
    ...shorthands.padding('0px', tokens.spacingHorizontalM),
    'backgroundColor': tokens.colorNeutralBackground1,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'whiteSpace': 'nowrap',
    [media.xs]: {
      ...shorthands.padding('0px', tokens.spacingHorizontalS),
    },
  },
  dot: {
    'width': '8px',
    'height': '8px',
    'flexShrink': 0,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    'backgroundColor': tokens.colorNeutralForeground4,
    '&[data-tone="success"]': { backgroundColor: tokens.colorPaletteGreenForeground1 },
    '&[data-tone="warning"]': { backgroundColor: tokens.colorPaletteDarkOrangeForeground1 },
    '&[data-tone="error"]': { backgroundColor: tokens.colorPaletteRedForeground1 },
    '&[data-tone="pending"]': { backgroundColor: tokens.colorPaletteYellowForeground1 },
  },
  label: {
    'color': tokens.colorNeutralForeground3,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
  },
  divider: {
    'width': '1px',
    'height': '12px',
    'flexShrink': 0,
    'backgroundColor': tokens.colorNeutralStroke2,
  },
  value: {
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase200,
    'fontWeight': tokens.fontWeightSemibold,
    'lineHeight': tokens.lineHeightBase200,
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
  },
})
