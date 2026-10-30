import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../../styles/media'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  'accountActions': {
  'display': 'flex',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  [media.xs]: {
    'alignItems': 'stretch',
  },
  },
  'accountAvatar': {
  'display': 'grid',
  'placeItems': 'center',
  'width': '52px',
  'height': '52px',
  'flexShrink': 0,
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'backgroundColor': 'var(--colorBrandBackground2)',
  'color': 'var(--colorBrandForeground1)',
  'fontSize': '20px',
  'fontWeight': 700,
  },
  'accountCopy': {
  'minWidth': '0px',
  },
  'accountIdentity': {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('16px'),
  'minWidth': '0px',
  },
  'accountMeta': {
  'display': 'flex',
  'alignItems': 'center',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  ...shorthands.margin('6px', '0', '0'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  },
  'accountName': {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '20px',
  'lineHeight': 1.25,
  'letterSpacing': '-0.02em',
  'overflowWrap': 'anywhere',
  },
  'accountPanel': {

  'gridTemplateColumns': 'minmax(0, 1fr) auto',
  'display': 'grid',
  'alignItems': 'center',
  ...shorthands.gap('24px'),
  ...shorthands.padding('24px'),
  'backgroundColor': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  [media.lg]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
  },
  },
  'bucketList': {
  'display': 'flex',
  'flexDirection': 'column',
  },
  'bucketRow': {

  'gridTemplateColumns': 'minmax(0, 1fr) auto',
  'display': 'grid',
  'alignItems': 'center',
  ...shorthands.gap('16px'),
  'minHeight': '60px',
  ...shorthands.padding('8px', '0'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  '&:last-child': {
    ...shorthands.borderBottom('none'),
  },
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
  },
  },
  'credentialBody': {
  'marginTop': '24px',
  },
  'credentialFact': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'minWidth': '0px',
  },
  'credentialFactLabel': {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'fontWeight': 500,
  },
  'credentialFactValue': {
  'color': 'var(--colorNeutralForeground1)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '12px',
  'lineHeight': 1.5,
  'overflowWrap': 'anywhere',
  },
  'credentialFacts': {

  'gridTemplateColumns': 'repeat(3, minmax(0, 1fr))',
  'display': 'grid',
  ...shorthands.gap('16px'),
  'paddingTop': '16px',
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  [media.md]: {
    'gridTemplateColumns': 'repeat(2, minmax(0, 1fr))',
  },
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
  },
  },
  'credentialGroup': {
  'minWidth': '0px',
  },
  'credentialGroupAction': {

  'justifyContent': 'flex-end',
  'display': 'flex',
  'flexShrink': 0,
  [media.sm]: {
    'justifyContent': 'flex-start',
  },
  },
  'credentialGroupCopy': {
  'minWidth': '0px',
  },
  'credentialGroupHeader': {

  'gridTemplateColumns': 'minmax(0, 1fr) auto',
  'display': 'grid',
  ...shorthands.gap('16px'),
  'alignItems': 'start',
  [media.sm]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
  },
  },
  'credentialGroupHint': {
  ...shorthands.margin('4px', '0', '0'),
  'maxWidth': '64ch',
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  'lineHeight': 1.55,
  },
  'credentialItem': {

  'gridTemplateColumns': 'minmax(180px, 1fr) minmax(170px, 0.75fr) auto',
  'alignItems': 'center',
  'display': 'grid',
  ...shorthands.gap('16px'),
  'minHeight': '72px',
  ...shorthands.padding('16px', '0'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  '&:last-child': {
    ...shorthands.borderBottom('none'),
  },
  [media.md]: {
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
  },
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
    'alignItems': 'start',
  },
  },
  'credentialItemActions': {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'flex-end',
  ...shorthands.gap('4px'),
  },
  'credentialItemId': {
  'color': 'var(--colorNeutralForeground2)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '12px',
  'overflowWrap': 'anywhere',
  },
  'credentialItemIdentity': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'minWidth': '0px',
  },
  'credentialItemMeta': {
  'display': 'flex',
  'flexDirection': 'column',
  'alignItems': 'flex-start',
  ...shorthands.gap('4px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'overflowWrap': 'anywhere',
  [media.md]: {
    'gridColumn': '1',
    'gridRow': 2,
  },
  [media.xs]: {
    'gridColumn': '1',
    'gridRow': 'auto',
  },
  },
  'credentialItemName': {
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '13px',
  'fontWeight': 600,
  },
  'credentialList': {
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  },
  'credentialModalContent': {
  'minWidth': '0px',
  },
  'credentialOverview': {
  'display': 'flex',
  'flexDirection': 'column',
  // 与 SectionCard 卡头的 24px 内缩对齐。
  ...shorthands.padding('8px', tokens.spacingHorizontalXXL, '16px'),
  },
  'credentialOverviewCopy': {
  'gridArea': 'copy',
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'minWidth': '0px',
  },
  'credentialOverviewStatus': {
  'gridArea': 'status',
  'justifySelf': 'start',
  },
  'credentialOverviewChevron': {
  'gridArea': 'chevron',
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'color': tokens.colorNeutralForeground2,
  },
  'credentialOverviewDescription': {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  'lineHeight': 1.5,
  },
  'credentialOverviewIcon': {
  'gridArea': 'icon',
  'alignSelf': 'center',
  'display': 'grid',
  'placeItems': 'center',
  'width': tokens.spacingHorizontalXXXL,
  'height': tokens.spacingHorizontalXXXL,
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': tokens.colorBrandBackground2,
  'color': tokens.colorBrandForeground2,
  },
  'credentialOverviewItem': {

  'gridTemplateColumns': '32px minmax(0, 1fr) auto 20px',
  'gridTemplateAreas': '"icon copy status chevron"',
  'backgroundColor': 'transparent',
  'color': 'var(--colorNeutralForeground2)',
  'display': 'grid',
  'alignItems': 'center',
  ...shorthands.gap('16px'),
  'minWidth': '0px',
  'minHeight': '78px',
  ...shorthands.padding('16px', '0'),
  ...shorthands.borderWidth('0px'), ...shorthands.borderStyle('solid'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'fontFamily': 'var(--fontFamilyBase)',
  'textAlign': 'left',
  'cursor': 'pointer',
  'transitionProperty': 'background-color, color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:last-child': {
    ...shorthands.borderBottom('0px'),
  },
  '&:hover': {
    'backgroundColor': 'var(--colorNeutralBackground1Hover)',
    'color': 'var(--colorBrandBackground)',
  },
  '&:focus-visible': {
    'outline': `2px solid var(--colorBrandBackground)`,
    'outlineOffset': '2px',
    ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  },
  // 窄屏：状态落到说明下方，不再占第三列被挤成竖排。
  [media.sm]: {
    'gridTemplateColumns': '32px minmax(0, 1fr) 18px',
    'gridTemplateAreas': '"icon copy chevron" "icon status chevron"',
    'gridTemplateRows': 'auto auto',
    'columnGap': tokens.spacingHorizontalS,
    'rowGap': tokens.spacingVerticalXS,
  },
  },
  'credentialOverviewMeta': {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  },
  'credentialOverviewTitle': {
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '14px',
  'fontWeight': 600,
  },
  'credentialOverviewTitleLine': {
  'display': 'flex',
  'alignItems': 'baseline',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  },
  'credentialStatusError': {
  'color': 'var(--colorPaletteRedForeground1)',
  'fontSize': '12px',
  'fontWeight': 600,
  },
  'credentialSubsection': {
  'marginTop': '24px',
  'paddingTop': '24px',
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  },
  'credentialSubsectionHeader': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'marginBottom': '8px',
  },
  'credentialSubsectionHint': {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'lineHeight': 1.5,
  },
  'credentialSubsectionTitle': {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '13px',
  'fontWeight': 600,
  },
  'credentialTitleLine': {
  'display': 'flex',
  'alignItems': 'center',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  'minHeight': '24px',
  },
  'eyebrow': {
  'display': 'block',
  'marginBottom': '5px',
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'fontWeight': 600,
  'letterSpacing': '0.06em',
  'textTransform': 'uppercase',
  },
  'metaDivider': {
  'width': '3px',
  'height': '3px',
  ...shorthands.borderRadius('999px'),
  'backgroundColor': 'var(--colorNeutralStroke1)',
  },
  'profilePage': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('24px'),
  },
  'statusBadge': {
  'display': 'inline-flex',
  'alignItems': 'center',
  ...shorthands.gap('6px'),
  'color': 'var(--colorPaletteGreenForeground1)',
  'fontSize': '12px',
  'fontWeight': 600,
  },
  'statusBadgeMuted': {
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'fontWeight': 600,
  },
  'statusDotSmall': {
  'width': '6px',
  'height': '6px',
  ...shorthands.borderRadius('999px'),
  'backgroundColor': 'var(--colorPaletteGreenForeground1)',
  },
  'tokenRevealRow': {
  'display': 'flex',
  ...shorthands.gap('8px'),
  'minWidth': '0px',
  [media.xs]: {
    'flexDirection': 'column',
  },
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
