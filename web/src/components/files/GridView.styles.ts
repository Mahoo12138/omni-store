import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useStyles = makeStyles({
  gridWrap: {
    'display': 'grid',
    'gridTemplateColumns': 'repeat(auto-fill, minmax(160px, 1fr))',
    ...shorthands.gap('12px'),
    ...shorthands.padding('12px'),
    'background': 'var(--colorNeutralBackground1)',
    ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
    ...shorthands.borderRadius('var(--borderRadiusLarge)'),
    [media.sm]: {
      'gridTemplateColumns': 'minmax(0, 1fr)',
    },
  },
  gridCard: {
    'display': 'flex',
    'flexDirection': 'column',
    'alignItems': 'center',
    ...shorthands.gap('6px'),
    ...shorthands.padding('12px'),
    ...shorthands.borderRadius('var(--borderRadiusMedium)'),
    'transitionProperty': 'background-color',
    'transitionDuration': 'var(--durationNormal)',
    'transitionTimingFunction': 'var(--curveDecelerateMax)',
    [media.sm]: {
      'display': 'grid',
      'gridTemplateColumns': '48px minmax(0, 1fr)',
      ...shorthands.gap('4px 12px'),
      'alignItems': 'center',
      ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
    },
  },
  dropTarget: {
    'backgroundColor': 'var(--colorBrandBackground2)',
    'outline': '2px solid var(--colorBrandBackground)',
    'outlineOffset': '-2px',
  },
  gridSelect: {
    'alignSelf': 'flex-start',
    'display': 'inline-flex',
    'alignItems': 'center',
    ...shorthands.gap('6px'),
    'fontSize': '12px',
    'cursor': 'pointer',
    [media.sm]: {
      // Griffel 不支持 gridColumn/gridRow 简写（会生成空规则）；用受支持的 gridArea。
      'gridArea': '1 / 1',
      'width': '44px',
      'height': '44px',
      'justifyContent': 'center',
      // 44px 命中区里只留勾选框，文字会换成两行。
      '& > span': {
        display: 'none',
      },
    },
  },
  gridIcon: {
    'width': '64px',
    'height': '64px',
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    [media.sm]: {
      'gridArea': '2 / 1',
      'width': '48px',
      'height': '48px',
    },
  },
  gridName: {
    'maxWidth': '100%',
    ...shorthands.padding('0px'),
    ...shorthands.borderWidth('0px'), ...shorthands.borderStyle('solid'),
    'background': 'transparent',
    'color': 'var(--colorNeutralForeground1)',
    'font': 'inherit',
    'fontSize': '13px',
    'textAlign': 'center',
    'textDecoration': 'none',
    'wordBreak': 'break-all',
    'cursor': 'pointer',
    '&:hover': {
      'color': 'var(--colorBrandBackground)',
    },
    '&:focus-visible': {
      'outline': '2px solid var(--colorBrandBackground)',
      'outlineOffset': '2px',
    },
    [media.sm]: {
      'gridArea': '1 / 2',
      'minHeight': '44px',
      'display': 'flex',
      'alignItems': 'center',
      'textAlign': 'left',
    },
  },
  gridActions: {
    'display': 'flex',
    'flexWrap': 'wrap',
    'justifyContent': 'center',
    ...shorthands.gap('4px'),
    [media.sm]: {
      'gridArea': '2 / 2',
      'justifyContent': 'flex-start',
    },
  },
  actionBtn: {
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
  },
  actionActive: {
    'color': 'var(--colorBrandBackground)',
  },
})
