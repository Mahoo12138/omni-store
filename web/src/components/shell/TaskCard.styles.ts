import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useStyles = makeStyles({
  root: {
    'width': 'min(360px, calc(100vw - 32px))',
    'display': 'flex',
    'flexDirection': 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingHorizontalL),
    'backgroundColor': tokens.colorNeutralBackground1,
    ...shorthands.borderWidth(tokens.strokeWidthThin),
    ...shorthands.borderStyle('solid'),
    ...shorthands.borderColor(tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    'color': tokens.colorNeutralForeground1,
    'fontFamily': tokens.fontFamilyBase,
  },
  header: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    ...shorthands.gap(tokens.spacingHorizontalL),
  },
  titleGroup: {
    'minWidth': '0px',
    'display': 'flex',
    'flexDirection': 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  meta: {
    'display': 'block',
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase300,
  },
  // 卡内文字按钮：关闭 / 取消上传 / 重试失败项。
  action: {
    ...shorthands.borderWidth('0px'),
    ...shorthands.borderStyle('solid'),
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXS),
    'background': 'transparent',
    'color': tokens.colorBrandForeground1,
    'cursor': 'pointer',
    'fontSize': tokens.fontSizeBase300,
    'fontWeight': tokens.fontWeightSemibold,
    'whiteSpace': 'nowrap',
    ':hover': {
      color: tokens.colorBrandForeground2Hover,
    },
    ':focus-visible': {
      'outline': `2px solid ${tokens.colorStrokeFocus2}`,
      'outlineOffset': '2px',
    },
    [media.md]: {
      'minHeight': '44px',
      ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    },
  },
  close: {
    ...shorthands.borderWidth('0px'),
    ...shorthands.borderStyle('solid'),
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXS),
    'background': 'transparent',
    'color': tokens.colorNeutralForeground2,
    'cursor': 'pointer',
    'fontSize': tokens.fontSizeBase300,
    'whiteSpace': 'nowrap',
    ':hover': {
      color: tokens.colorNeutralForeground1,
    },
    ':focus-visible': {
      'outline': `2px solid ${tokens.colorStrokeFocus2}`,
      'outlineOffset': '2px',
    },
    [media.md]: {
      'minHeight': '44px',
      ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    },
  },
  errors: {
    'display': 'flex',
    'flexDirection': 'column',
    ...shorthands.gap('3px'),
    ...shorthands.margin('0px'),
    'paddingLeft': '18px',
    'color': tokens.colorPaletteRedForeground1,
    'fontSize': tokens.fontSizeBase300,
  },
  actions: {
    'display': 'flex',
    'justifyContent': 'flex-end',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
})
