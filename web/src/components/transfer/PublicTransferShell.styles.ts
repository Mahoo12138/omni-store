import { makeStyles, shorthands } from '@fluentui/react-components'

export const useStyles = makeStyles({
  brand: {
  // TODO 未解析: [publicEntry.brand, { minWidth: 0, maxWidth: '100%', selectors: { '&:focus-visible': { outline: `2px solid var(--colorNeutralBackground1)`, outlineOffset: 3 } } }]
  },
  brandLogo: {
  'width': '32px',
  'height': '32px',
  'flexShrink': 0,
  },
  brandCopy: {
  'minWidth': '0px',
  },
  brandName: {
  'maxWidth': '28ch',
  'overflowWrap': 'anywhere',
  },
  heroCopy: {
  'minWidth': '0px',
  'maxWidth': '660px',
  'overflowWrap': 'anywhere',
  },
  workbench: {
  'minWidth': '0px',
  ...shorthands.padding(`40px 48px`),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  'background': 'var(--colorNeutralBackground1)',
  'boxShadow': 'var(--shadow16)',
  '@media screen and (max-width: 900px)': {
    ...shorthands.padding('40px'),
  },
  '@media screen and (max-width: 640px)': {
    ...shorthands.padding('24px'),
  },
  '@media screen and (max-width: 480px)': {
    ...shorthands.padding('16px'),
  },
  },
})
