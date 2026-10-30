import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  // 表格行尾的「更多」触发器：与 ghost 按钮同高（32px），方形图标位。
  'rowMenuTrigger': {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': tokens.spacingHorizontalXXXL,
  'height': tokens.spacingHorizontalXXXL,
  ...shorthands.padding('0px'),
  ...shorthands.borderWidth('0px'), ...shorthands.borderStyle('solid'),
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': 'transparent',
  'color': tokens.colorNeutralForeground2,
  'cursor': 'pointer',
  '&:hover': {
    'backgroundColor': tokens.colorNeutralBackground1Hover,
    'color': tokens.colorNeutralForeground1,
  },
  '&:focus-visible': {
    'outline': `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    'outlineOffset': '2px',
  },
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
