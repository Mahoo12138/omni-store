import { makeStyles, shorthands } from '@fluentui/react-components'

export const useStyles = makeStyles({
  page: {
  'minHeight': '100vh',
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.padding('16px'),
  },
  card: {
  'width': '100%',
  'maxWidth': '380px',
  'backgroundColor': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  'boxShadow': 'var(--shadow4)',
  ...shorthands.padding('40px'),
  },
  brand: {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  ...shorthands.gap('10px'),
  'marginBottom': '24px',
  },
  brandName: {
  'fontSize': '20px',
  'fontWeight': 700,
  'color': 'var(--colorNeutralForeground1)',
  },
  subtitle: {
  'fontSize': '13px',
  'color': 'var(--colorNeutralForeground2)',
  ...shorthands.margin('0px'),
  'marginBottom': '24px',
  'textAlign': 'center',
  },
  form: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  },
  error: {
  'fontSize': '13px',
  'color': 'var(--colorPaletteRedForeground1)',
  ...shorthands.margin('0px'),
  },
  footer: {
  'marginTop': '16px',
  'fontSize': '13px',
  'color': 'var(--colorNeutralForeground2)',
  'textAlign': 'center',
  },
})
