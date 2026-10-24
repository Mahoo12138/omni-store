import { makeStyles, shorthands } from '@fluentui/react-components'

export const useStyles = makeStyles({
  pageHeader: {
  'display': 'flex',
  'alignItems': 'center',
  'flexWrap': 'wrap',
  ...shorthands.gap('16px'),
  'marginTop': '0px',
  'marginBottom': '24px',
  },
  pageTitle: {
  'flex': 1,
  'fontSize': '20px',
  'fontWeight': 700,
  'color': 'var(--colorNeutralForeground1)',
  ...shorthands.margin('0px'),
  },
  pageActions: {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  'flexWrap': 'wrap',
  },
})
