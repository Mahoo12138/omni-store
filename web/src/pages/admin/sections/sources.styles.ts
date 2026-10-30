import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../../styles/media'
import { useSharedStyles } from '../shared.styles'

export const useSectionStyles = makeStyles({
  'protocolControl': {
  'flexShrink': 0,
  },
  'protocolCopy': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('4px'),
  'minWidth': '0px',
  },
  'protocolHint': {
  ...shorthands.margin('0px'),
  'fontSize': '13px',
  'lineHeight': 1.6,
  'color': 'var(--colorNeutralForeground2)',
  'overflowWrap': 'anywhere',
  },
  'protocolList': {
  'display': 'flex',
  'flexDirection': 'column',
  },
  'protocolName': {
  'fontSize': '14px',
  'fontWeight': 600,
  'color': 'var(--colorNeutralForeground1)',
  },
  'protocolRow': {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  ...shorthands.gap('16px'),
  ...shorthands.padding('16px', '0'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  '&:first-child': {
    'paddingTop': '0px',
  },
  '&:last-child': {
    ...shorthands.borderBottom('0px'),
    'paddingBottom': '0px',
  },
  },
  sourceActions: {
    'gridArea': 'actions',
    'display': 'flex',
    'flexWrap': 'nowrap',
    'alignItems': 'center',
    'justifySelf': 'end',
    ...shorthands.gap(tokens.spacingHorizontalXXS),
    'flexShrink': 0,
    '@container storage-sources (max-width: 560px)': {
      'justifySelf': 'stretch',
      'justifyContent': 'flex-start',
      // Fluent 按钮有 96px 最小宽度，窄卡片里三个按钮一行放不下；允许换行。
      'flexWrap': 'wrap',
      'rowGap': tokens.spacingVerticalXS,
    },
  },
  // 间距全部由外层容器给：TabList 与 Tabs.Panel 不再被注入外观，
  // Fluent tab 保持默认观感，panel 的 hidden 也不会被 display 打败。
  'sourceConfig': {
  'minWidth': '0px',
  'flexShrink': 0,
  'display': 'grid',
  ...shorthands.gap('var(--spacingVerticalXXL)'),
  },
  'sourceConfigNote': {
  ...shorthands.margin('0px'),
  'fontSize': '12px',
  'lineHeight': 1.6,
  'color': 'var(--colorNeutralForeground2)',
  },
  'sourceConfigPanelBody': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('var(--spacingVerticalXXL)'),
  'minWidth': '0px',
  },
  // 两行截断走 global.css 的 omnistore-clamp-2(与 className 组合使用)
  'sourceConfigPath': {

  'display': '-webkit-box',
  'overflow': 'hidden',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '12px',
  'lineHeight': 1.6,
  'overflowWrap': 'anywhere',
  },
  'sourceConfigTitle': {

  'display': '-webkit-box',
  'overflow': 'hidden',
  'overflowWrap': 'anywhere',
  },
  sourceCopy: {
    'minWidth': '0px',
    'display': 'grid',
    // 单列栅格默认 max-content，长名称/长路径会把卡片撑出容器；必须显式允许收缩。
    'gridTemplateColumns': 'minmax(0, 1fr)',
    ...shorthands.gap(tokens.spacingVerticalXXS),
  },
  'sourceHeading': {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  },
  sourceIcon: {
    'display': 'grid',
    'placeItems': 'center',
    'width': tokens.spacingHorizontalXXXL,
    'height': tokens.spacingHorizontalXXXL,
    'flexShrink': 0,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'backgroundColor': tokens.colorNeutralBackground1,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    'color': tokens.colorNeutralForeground2,
  },
  sourceIdentity: {
    'gridArea': 'identity',
    'display': 'flex',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    'minWidth': '0px',
  },
  // 资源行：身份与操作同一行、元信息独占一条底带。
  // 旧布局把身份铺满一行、第二行「元信息左 / 操作右」，中间必然留一大片空。
  sourceItem: {
    'display': 'grid',
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    'gridTemplateAreas': '"identity actions" "meta meta"',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalXL,
    'rowGap': tokens.spacingVerticalL,
    'minWidth': '0px',
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalXL),
    ...shorthands.borderWidth(tokens.strokeWidthThin), ...shorthands.borderStyle('solid'), ...shorthands.borderColor(tokens.colorNeutralStroke2),
    'backgroundColor': tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'transitionProperty': 'border-color',
    'transitionDuration': tokens.durationFaster,
    '@container storage-sources (max-width: 560px)': {
      'gridTemplateAreas': '"identity" "meta" "actions"',
      'gridTemplateColumns': 'minmax(0, 1fr)',
    },
    '&:hover': {
      ...shorthands.borderColor(tokens.colorNeutralStroke1),
    },
  },
  'sourceList': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  'containerType': 'inline-size',
  'containerName': 'storage-sources',
  },
  // 元信息底带：一条内缩的细线把它与身份区隔开，标签与值同行。
  sourceMeta: {
    'gridArea': 'meta',
    'display': 'flex',
    'flexWrap': 'wrap',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalXXL,
    'rowGap': tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, '0px', '0px'),
    'borderTopWidth': tokens.strokeWidthThin,
    'borderTopStyle': 'solid',
    'borderTopColor': tokens.colorNeutralStroke2,
    'minWidth': '0px',
  },
  sourceMetaItem: {
    'display': 'flex',
    'alignItems': 'baseline',
    ...shorthands.gap(tokens.spacingHorizontalS),
    'minWidth': '0px',
  },
  sourceMetaLabel: {
    'color': tokens.colorNeutralForeground3,
    'fontSize': tokens.fontSizeBase200,
  },
  sourceMetaMuted: {
  'fontSize': '13px',
  'overflowWrap': 'anywhere',
  'color': 'var(--colorNeutralForeground2)',
  'fontWeight': 400,
  },
  sourceMetaValue: {
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase200,
    'fontWeight': tokens.fontWeightMedium,
    'overflowWrap': 'anywhere',
  },
  sourceName: {
    ...shorthands.margin('0px'),
    'minWidth': '0px',
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase300,
    'fontWeight': tokens.fontWeightSemibold,
    'lineHeight': tokens.lineHeightBase300,
    // 单行省略：名称长度不该改变行高，完整值走 title。
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
  },
  sourcePath: {
    'display': 'block',
    'color': tokens.colorNeutralForeground2,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    // 长路径单行省略，避免把卡片撑成两行高；完整路径在 title 与配置弹窗里。
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
  },
  'sourcePreview': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  ...shorthands.padding('16px'),
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusMedium)'),
  'backgroundColor': 'var(--colorNeutralBackground2)',
  },
  'sourcePreviewEmpty': {
  ...shorthands.margin('0px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  },
  'sourcePreviewEntries': {
  'maxHeight': '190px',
  'overflowY': 'auto',
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  },
  'sourcePreviewEntry': {
  'display': 'grid',
  'gridTemplateColumns': 'minmax(0, 1fr) auto',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  'minHeight': '36px',
  ...shorthands.padding('6px', '4px'),
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'color': 'var(--colorNeutralForeground1)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '12px',
  '&:last-child': {
    ...shorthands.borderBottom('none'),
  },
  },
  'sourcePreviewEntryName': {

  'overflow': 'hidden',
  ...shorthands.overflow('hidden'),
  'textOverflow': 'ellipsis',
  'whiteSpace': 'nowrap',
  },
  'sourcePreviewEyebrow': {
  'display': 'block',
  'marginBottom': '4px',
  'color': 'var(--colorPaletteGreenForeground1)',
  'fontSize': '12px',
  'fontWeight': 600,
  },
  'sourcePreviewHeader': {
  'display': 'flex',
  'alignItems': 'flex-start',
  'justifyContent': 'space-between',
  ...shorthands.gap('16px'),
  },
  'sourcePreviewPath': {
  'color': 'var(--colorNeutralForeground1)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'fontSize': '13px',
  'overflowWrap': 'anywhere',
  },
  'sourcePreviewStatValue': {
  'display': 'block',
  'marginBottom': '2px',
  'color': 'var(--colorNeutralForeground1)',
  'fontSize': '16px',
  },
  'sourcePreviewStats': {

  'gridTemplateColumns': 'repeat(4, minmax(0, 1fr))',
  'display': 'grid',
  ...shorthands.gap('8px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  [media.xs]: {
    'gridTemplateColumns': 'repeat(2, minmax(0, 1fr))',
  },
  },
  'sourcePreviewWarnings': {
  ...shorthands.margin('0px'),
  'paddingLeft': '18px',
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '12px',
  'lineHeight': 1.55,
  },
  sourceProtocolTag: {
    ...shorthands.padding('1px', tokens.spacingHorizontalS),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    'backgroundColor': tokens.colorNeutralBackground3,
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
  },
  sourceProtocols: {
    'display': 'flex',
    'flexWrap': 'wrap',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  'sourceQuotaInput': {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap('8px'),
  },
  'staticAccessStack': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('24px'),
  'flexShrink': 0,
  'minWidth': '0px',
  'paddingTop': '24px',
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  },
  'staticProtocolActions': {
  'display': 'flex',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  },
  'staticProtocolBody': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  'minWidth': '0px',
  },
  'staticProtocolHeader': {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  ...shorthands.gap('16px'),
  },
  'staticProtocolSection': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  'minWidth': '0px',
  'flexShrink': 0,
  },
  staticProtocolSettings: {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  'minWidth': '0px',
  'flexShrink': 0,
  'borderTopWidth': '1px', 'borderTopStyle': 'solid', 'borderTopColor': 'var(--colorNeutralStroke2)',
  'paddingTop': '24px',
  }
})

export function useStyles() {
  return { ...useSharedStyles(), ...useSectionStyles() }
}
