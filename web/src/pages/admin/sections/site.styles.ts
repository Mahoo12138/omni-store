import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../../styles/media'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  'exportSummary': {

  'gridTemplateColumns': '44px minmax(0, 1fr) auto',
  'alignItems': 'center',
  'display': 'grid',
  ...shorthands.gap('16px'),
  [media.sm]: {
    'gridTemplateColumns': '44px minmax(0, 1fr)',
    'alignItems': 'start',
  },
  },
  'exportIcon': {
  'display': 'grid',
  'placeItems': 'center',
  'width': '44px',
  'height': '44px',
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'backgroundColor': 'var(--colorBrandBackground2)',
  'color': 'var(--colorBrandBackground)',
  },
  'exportCopy': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '13px',
  'lineHeight': 1.55,
  },
  'exportCopySecondary': {
  'color': 'var(--colorNeutralForeground2)',
  },
  'exportAction': {

  'justifyContent': 'flex-end',
  'display': 'flex',
  [media.sm]: {
    'gridColumn': '1 / -1',
    'justifyContent': 'flex-start',
    'paddingLeft': '60px',
  },
  },
  'exportNotice': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  ...shorthands.padding('16px'),
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'backgroundColor': 'var(--colorNeutralBackground2)',
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '13px',
  'lineHeight': 1.55,
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
