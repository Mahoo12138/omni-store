import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../../styles/media'

export const useSharedStyles = makeStyles({
  'compactTable': {
  'width': '100%',
  'minWidth': '720px',
  'borderCollapse': 'collapse',
  // Fluent Table 原生模式默认 table-layout:fixed；管理表格需要按内容自适应列宽。
  'tableLayout': 'auto',
  'fontSize': '13px',
  },
  'compactTableWide': {
  'minWidth': '920px',
  },
  'compactTd': {
  ...shorthands.padding('10px', '16px'),
  'color': 'var(--colorNeutralForeground1)',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'verticalAlign': 'middle',
  'whiteSpace': 'nowrap',
  // 表格卡全出血后，首末列与卡头的 24px 内缩对齐。
  '&:first-child': { 'paddingLeft': tokens.spacingHorizontalXXL },
  '&:last-child': { 'paddingRight': tokens.spacingHorizontalXXL },
  },
  'compactTh': {
  'textAlign': 'left',
  ...shorthands.padding('10px', '16px'),
  'color': 'var(--colorNeutralForeground2)',
  'fontWeight': 500,
  // 表头铺一层 background2，和卡片体拉开层次；与仪表盘卡头同一种中性表面。
  'backgroundColor': 'var(--colorNeutralBackground2)',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  'whiteSpace': 'nowrap',
  '&:first-child': { 'paddingLeft': tokens.spacingHorizontalXXL },
  '&:last-child': { 'paddingRight': tokens.spacingHorizontalXXL },
  },
  'compactTr': {
  'transitionProperty': 'background-color', 'transitionDuration': 'var(--durationNormal)', 'transitionTimingFunction': 'var(--curveDecelerateMax)',
  '&:hover': {
    'backgroundColor': 'var(--colorNeutralBackground1Hover)',
  },
  },
  'formRow': {
  'display': 'flex',
  'flexWrap': 'wrap',
  ...shorthands.gap('8px'),
  'alignItems': 'center',
  },
  // Fluent Textarea 的外观补充：替换原 ui/Field.utils.css 的 omnistore-field-textarea。
  // 根是 <span>,宽高与最小高落在根上,等宽字体落在内部真实 textarea 元素上。
  // 根槽是 <span>（Fluent 用它画描边），宽度只能落在这里；
  // 等宽字体是凭据/JSON 输入的语义排版，穿透到真实 <textarea>，其余交回 Fluent。
  'formTextarea': {
  'width': '100%',
  '& textarea': {
    'fontFamily': 'var(--fontFamilyMonospace)',
  },
  },
  'kvLabel': {
  'color': 'var(--colorNeutralForeground2)',
  },
  'kvRow': {

  'gridTemplateColumns': '120px 1fr',
  'alignItems': 'center',
  'display': 'grid',
  ...shorthands.gap('16px'),
  'fontSize': '13px',
  [media.xs]: {
    'gridTemplateColumns': 'minmax(0, 1fr)',
    ...shorthands.gap('4px'),
    'alignItems': 'start',
  },
  },
  'kvValue': {
  'minWidth': '0px',
  'color': 'var(--colorNeutralForeground1)',
  'fontFamily': 'var(--fontFamilyMonospace)',
  'wordBreak': 'break-all',
  },
  // 一行身份标识，不画横线：面板底部与窄栏头像共处同一收束带，
  // 左缘对齐分组标题（同为 12px 内缩）。
  'section': {

  'overflow': 'hidden',
  'backgroundColor': 'var(--colorNeutralBackground1)',
  ...shorthands.borderWidth('1px'), ...shorthands.borderStyle('solid'), ...shorthands.borderColor('var(--colorNeutralStroke2)'),
  ...shorthands.borderRadius('var(--borderRadiusLarge)'),
  ...shorthands.overflow('hidden'),
  },
  'sectionBody': {
  ...shorthands.padding('24px', '28px'),
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('16px'),
  },
  'sectionHeader': {
  ...shorthands.padding('20px', '28px'),
  'backgroundColor': 'var(--colorNeutralBackground1)',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  },
  'sectionHeaderAction': {
  'display': 'flex',
  'flexShrink': 0,
  },
  'sectionHeaderCopy': {
  'minWidth': '0px',
  },
  'sectionHeaderWithAction': {
  'alignItems': 'center',
  'display': 'flex',
  'justifyContent': 'space-between',
  ...shorthands.gap('24px'),
  ...shorthands.padding('20px', '28px'),
  'backgroundColor': 'var(--colorNeutralBackground1)',
  'borderBottomWidth': '1px', 'borderBottomStyle': 'solid', 'borderBottomColor': 'var(--colorNeutralStroke2)',
  [media.lg]: {
    'alignItems': 'stretch',
    'flexDirection': 'column',
    ...shorthands.gap('16px'),
  },
  },
  'sectionHint': {
  ...shorthands.margin('4px', '0', '0'),
  'color': 'var(--colorNeutralForeground2)',
  'fontSize': '13px',
  },
  'sectionTitle': {
  ...shorthands.margin('0px'),
  'fontSize': '14px',
  'fontWeight': 600,
  'color': 'var(--colorNeutralForeground1)',
  },
  'dataScroll': {
  'maxWidth': '100%',
  'overflowX': 'auto',
  'overscrollBehaviorX': 'contain',
  'scrollBehavior': 'smooth',
  'scrollbarColor': `var(--colorNeutralStroke1) transparent`,
  'scrollbarWidth': 'thin',
  '&:focus-visible': {
    'outline': `2px solid var(--colorBrandBackground)`,
    'outlineOffset': '-2px',
  },
  },
  'dataScrollFrame': {
  'minWidth': '0px',
  'maxWidth': '100%',
  },

  // 全站设置页统一的卡片语言：tinted 卡头 + 32px 图标位 + 白底数据体。
  // 表单一类的卡片用默认 body 内边距；表格/列表自己管留白的用 cardBodyFlush。
  'card': {
  'minWidth': '0px',
  'overflow': 'hidden',
  'backgroundColor': tokens.colorNeutralBackground1,
  ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  'cardHeader': {
  'display': 'flex',
  'alignItems': 'center',
  'justifyContent': 'space-between',
  ...shorthands.gap(tokens.spacingHorizontalL),
  ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalXXL),
  'backgroundColor': tokens.colorNeutralBackground2,
  'borderBottomWidth': tokens.strokeWidthThin,
  'borderBottomStyle': 'solid',
  'borderBottomColor': tokens.colorNeutralStroke2,
  [media.lg]: {
    'alignItems': 'stretch',
    'flexDirection': 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  },
  'cardHeaderActions': {
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalS),
  'flexShrink': 0,
  },
  'cardHeaderCopy': {
  'display': 'flex',
  'alignItems': 'flex-start',
  ...shorthands.gap(tokens.spacingHorizontalM),
  'minWidth': '0px',
  },
  // 无标题的工具栏卡头：图标与单行说明垂直居中。
  'cardHeaderCopyToolbar': {
  'alignItems': 'center',
  },
  // 只有标题、没有说明：标题行与 32px 图标位整体居中，避免底部留下空档。
  'cardHeaderCopyCentered': {
  'alignItems': 'center',
  },
  'cardBody': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap(tokens.spacingVerticalL),
  ...shorthands.padding(tokens.spacingVerticalXL, tokens.spacingHorizontalXXL),
  'minWidth': '0px',
  },
  'cardBodyFlush': {
  ...shorthands.padding('0px'),
  ...shorthands.gap('0px'),
  },
  'cardTitle': {
  ...shorthands.margin('0px'),
  'fontSize': tokens.fontSizeBase400,
  'lineHeight': tokens.lineHeightBase400,
  'fontWeight': tokens.fontWeightSemibold,
  'color': tokens.colorNeutralForeground1,
  },
  'cardTitleBlock': {
  'display': 'flex',
  'flexDirection': 'column',
  ...shorthands.gap('2px'),
  'minWidth': '0px',
  },
  'cardTitleRow': {
  'display': 'flex',
  'alignItems': 'center',
  ...shorthands.gap(tokens.spacingHorizontalS),
  'minWidth': '0px',
  },
  'cardHint': {
  ...shorthands.margin('0px'),
  'display': 'flex',
  'flexWrap': 'wrap',
  'alignItems': 'center',
  'columnGap': tokens.spacingHorizontalS,
  'rowGap': tokens.spacingVerticalXXS,
  'fontSize': tokens.fontSizeBase200,
  'lineHeight': tokens.lineHeightBase200,
  'color': tokens.colorNeutralForeground2,
  },
  // 工具栏卡头的说明是卡头唯一的文字，升到正文档。
  'cardHintToolbar': {
  'fontSize': tokens.fontSizeBase300,
  'lineHeight': tokens.lineHeightBase300,
  },
  // 32px 图标位：中性、品牌与三种语义色，全部走 Fluent token。
  'iconChip': {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'width': tokens.spacingHorizontalXXXL,
  'height': tokens.spacingHorizontalXXXL,
  'flexShrink': 0,
  ...shorthands.borderRadius(tokens.borderRadiusMedium),
  'backgroundColor': tokens.colorNeutralBackground3,
  'color': tokens.colorNeutralForeground2,
  '&[data-tone="neutral"]': {
    'backgroundColor': tokens.colorNeutralBackground1,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  '&[data-tone="brand"]': {
    'backgroundColor': tokens.colorBrandBackground2,
    'color': tokens.colorBrandForeground2,
  },
  '&[data-tone="success"]': {
    'backgroundColor': tokens.colorPaletteGreenBackground1,
    'color': tokens.colorPaletteGreenForeground1,
  },
  '&[data-tone="warning"]': {
    'backgroundColor': tokens.colorPaletteDarkOrangeBackground1,
    'color': tokens.colorPaletteDarkOrangeForeground1,
  },
  '&[data-tone="danger"]': {
    'backgroundColor': tokens.colorPaletteRedBackground1,
    'color': tokens.colorPaletteRedForeground1,
  },
  },
})
