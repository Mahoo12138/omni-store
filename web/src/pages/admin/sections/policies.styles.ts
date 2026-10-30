import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../../styles/media'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  'policyEditorEmpty': {
  ...shorthands.margin('0px'),
  ...shorthands.padding('16px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  },
  // Checkbox 的排版交回 Fluent，这里只保留 flex 子项防溢出。
  'policyEditorIdentity': {
  'minWidth': '0px',
  },
  'policyEditorList': {
  'display': 'flex',
  'flexDirection': 'column',
  'maxHeight': '420px',
  'overflowY': 'auto',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  },
  'policyEditorMeta': {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  },
  'policyEditorRow': {

  'gridTemplateColumns': 'minmax(0, 1fr) auto',
  'display': 'grid',
  'alignItems': 'center',
  ...shorthands.gap('16px'),
  'minHeight': '48px',
  ...shorthands.padding('8px', '16px'),
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
    ...shorthands.gap('8px'),
  },
  },
  'policyPathRuleRow': {

  'gridTemplateColumns': 'minmax(180px, 1fr) auto auto',
  'display': 'grid',
  ...shorthands.gap('8px'),
  'alignItems': 'center',
  'width': '100%',
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    'paddingLeft': '0px',
  },
  },
  'policyPathRules': {
  'display': 'flex',
  'flexDirection': 'column',
  'alignItems': 'flex-start',
  ...shorthands.gap('8px'),
  ...shorthands.padding('0', '16px', '16px', '42px'),
  [media.xs]: {
    'paddingLeft': '16px',
  },
  },
  'policySourceBlock': {
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  '&:last-child': {
    ...shorthands.borderBottom('none'),
  },
  },
  'policySummary': {
  'display': 'flex',
  'flexWrap': 'nowrap',
  ...shorthands.gap('4px'),
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
