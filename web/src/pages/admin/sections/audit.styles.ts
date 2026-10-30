import { makeStyles, shorthands } from '@fluentui/react-components'
import { media } from '../../../styles/media'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  // 默认只露出主体/关键字,入口/结果收在展开按钮后。
  auditField: {
  'width': '240px',
  'minWidth': '0px',
  },
  auditFieldKeyword: {
  'flex': '1 1 280px',
  'minWidth': '240px',
  },
  'auditFilterActions': {
  'display': 'flex',
  ...shorthands.gap('8px'),
  'alignItems': 'center',
  'marginLeft': 'auto',
  },
  'auditFilters': {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'flex-end',
  ...shorthands.gap('16px'),
  ...shorthands.padding('24px'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'backgroundColor': 'var(--colorNeutralBackground1)',
  },
  'auditPagination': {

  'alignItems': 'center',
  'display': 'flex',
  'justifyContent': 'space-between',
  ...shorthands.gap('16px'),
  ...shorthands.padding('16px', '24px'),
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  [media.sm]: {
    'alignItems': 'stretch',
    'flexDirection': 'column',
  },
  },
  'auditPaginationActions': {
  'display': 'flex',
  ...shorthands.gap('8px'),
  },
  auditToggleExpanded: {
  'transform': 'rotate(180deg)',
  },
  'compactTableAudit': {
  'minWidth': '1120px',
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
