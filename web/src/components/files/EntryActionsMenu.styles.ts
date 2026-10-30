import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useStyles = makeStyles({
  trigger: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': '28px',
    'height': '28px',
    'background': 'none',
    ...shorthands.borderStyle('none'),
    ...shorthands.borderRadius('var(--borderRadiusSmall)'),
    'color': 'var(--colorNeutralForeground2)',
    'cursor': 'pointer',
    'transitionProperty': 'background-color, color',
    'transitionDuration': 'var(--durationNormal)',
    'transitionTimingFunction': 'var(--curveDecelerateMax)',
    '&:hover': {
      'backgroundColor': 'var(--colorBrandBackground2)',
      'color': 'var(--colorBrandBackground)',
    },
    [media.sm]: {
      'width': '44px',
      'height': '44px',
    },
    'flexShrink': 0,
  },
})
