import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

// FormLayout 三件套的布局。字段本体是 Fluent 原生 Field（label/hint/validationMessage），
// 这里只补栅格与动作行 —— 32px 之外的尺寸不出现，栅格列宽用 minmax(0,1fr) 防止内容撑破。
export const useStyles = makeStyles({
  field: {
    'minWidth': '0px',
  },
  grid: {
    'display': 'grid',
    'gridTemplateColumns': 'minmax(0, 1fr)',
    ...shorthands.gap(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    'minWidth': '0px',
  },
  gridTwo: {
    'gridTemplateColumns': 'minmax(0, 1fr) minmax(0, 1fr)',
    [media.xs]: {
      'gridTemplateColumns': 'minmax(0, 1fr)',
    },
  },
  gridThree: {
    'gridTemplateColumns': 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    [media.sm]: {
      'gridTemplateColumns': 'minmax(0, 1fr) minmax(0, 1fr)',
    },
    [media.xs]: {
      'gridTemplateColumns': 'minmax(0, 1fr)',
    },
  },
  actions: {
    'display': 'flex',
    'justifyContent': 'flex-end',
    'alignItems': 'center',
    'flexWrap': 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.margin(tokens.spacingVerticalS, '0', '0'),
  },
})
