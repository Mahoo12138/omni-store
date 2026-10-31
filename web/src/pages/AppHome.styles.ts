import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../styles/media'
import { layout } from '../styles/layout'

// /app 首页：一页「文件室」。
//
// 版面是印刷式的，不是卡片式的：报头（日期 / 问候 / 命令搜索 / 等距几何）、
// 编号分区（01 存储源 / 02 最近文件）、左侧目录牌 + 右侧台账。没有卡片套卡片，
// 层级只靠字阶、细线与一层很轻的色阶（Background2 作铭牌底）。
// 超过 32px 的结构尺寸全部来自 layout.ts；颜色与间距全部走 Fluent token。
export const useStyles = makeStyles({
  // ---- 报头 ----
  pageHeader: {
    'position': 'relative',
    'display': 'grid',
    'gridTemplateColumns': `minmax(0px, 1fr) ${layout.appHomeStageWidth}`,
    'alignItems': 'center',
    'columnGap': layout.appHomeColumnGap,
    'rowGap': tokens.spacingVerticalXXL,
    'marginBottom': layout.appHomeHeaderGap,
    'minWidth': '0px',
    [media.lg]: {
      'gridTemplateColumns': 'minmax(0px, 1fr)',
    },
  },
  headerCopy: {
    'display': 'grid',
    'justifyItems': 'start',
    'minWidth': '0px',
  },
  // 日期是一条技术标注：mono 数字 + 24px 品牌短线，与公开首页的 kicker 同一母题。
  kicker: {
    'display': 'inline-flex',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    'margin': `0px 0px ${tokens.spacingVerticalM}`,
    'color': tokens.colorBrandForeground1,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '0.08em',
    '&::before': {
      'content': '""',
      'width': tokens.spacingHorizontalXXL,
      'height': tokens.strokeWidthThick,
      'flexShrink': 0,
      'backgroundColor': tokens.colorCompoundBrandBackground,
      'transformOrigin': 'left center',
      'animation': 'omnistore-rule-grow 480ms cubic-bezier(0.16,1,0.3,1) both',
    },
  },
  riseKicker: {
    animation: 'omnistore-rise 400ms cubic-bezier(0.1,0.9,0.2,1) both',
  },
  // 下边距挂在遮罩上：overflow hidden 让遮罩成为 BFC，h1 的 margin 会被算进高度，
  // 108% 的入场位移就盖不住字。
  titleMask: {
    'display': 'block',
    'overflow': 'hidden',
    'maxWidth': '100%',
    ...shorthands.margin('0px', '0px', tokens.spacingVerticalM),
  },
  pageTitle: {
    'margin': '0px',
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeHero900,
    'lineHeight': 1.12,
    'fontWeight': tokens.fontWeightBold,
    'letterSpacing': '-0.03em',
    'textWrap': 'balance',
    'overflowWrap': 'anywhere',
    'animation': 'omnistore-mask-rise 620ms cubic-bezier(0.16,1,0.3,1) 60ms both',
    [media.xl]: {
      'fontSize': tokens.fontSizeHero800,
      'lineHeight': 1.15,
      'letterSpacing': '-0.02em',
    },
    [media.sm]: {
      'fontSize': tokens.fontSizeHero700,
      'lineHeight': 1.2,
      'letterSpacing': '-0.015em',
    },
  },
  // 命令搜索：长得像输入框，但语义是按钮（打开搜索弹窗）。原生 button 让
  // 嵌套 hover（图标变色、边框提亮）能像普通 DOM 一样落地。
  commandBar: {
    'display': 'flex',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    'width': '100%',
    'maxWidth': layout.appHomeSearchMaxWidth,
    'height': layout.appHomeSearchHeight,
    'marginTop': tokens.spacingVerticalXXL,
    'paddingInline': tokens.spacingHorizontalM,
    'backgroundColor': tokens.colorNeutralBackground2,
    'color': tokens.colorNeutralForeground2,
    'fontFamily': 'inherit',
    'fontSize': tokens.fontSizeBase300,
    'textAlign': 'start',
    'cursor': 'pointer',
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'transitionProperty': 'background-color, border-color, color',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
    'animation': 'omnistore-rise 420ms cubic-bezier(0.1,0.9,0.2,1) 180ms both',
    '&:hover': {
      'backgroundColor': tokens.colorNeutralBackground2Hover,
      ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
      'color': tokens.colorNeutralForeground1,
    },
    '&:hover svg': {
      color: tokens.colorBrandForeground1,
    },
    '&:focus-visible': {
      outlineOffset: '2px',
    },
    [media.sm]: {
      'height': layout.appHomeSearchHeightTouch,
    },
  },
  commandText: {
    'flexGrow': 1,
    'minWidth': '0px',
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
  },
  commandKbd: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'flexShrink': 0,
    'minWidth': tokens.spacingHorizontalXXXL,
    'height': tokens.spacingHorizontalXL,
    ...shorthands.padding('0px', tokens.spacingHorizontalXS),
    'backgroundColor': tokens.colorNeutralBackground1,
    'color': tokens.colorNeutralForeground3,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'letterSpacing': '0.04em',
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },

  // ---- 报头右侧的等距几何场 ----
  // 300×216 的装饰舞台：品牌光晕 + 菱形晶格 + 三只逐级升高的箱体。
  // 全部 aria-hidden，指针事件穿透，不参与内容流。
  stage: {
    'position': 'relative',
    'width': layout.appHomeStageWidth,
    'height': layout.appHomeStageHeight,
    'justifySelf': 'end',
    'pointerEvents': 'none',
    [media.lg]: {
      'display': 'none',
    },
  },
  stageGlow: {
    'position': 'absolute',
    'top': '4%',
    'insetInlineEnd': '2%',
    'width': '76%',
    'height': '88%',
    'backgroundImage': `radial-gradient(ellipse at 50% 50%, ${tokens.colorBrandBackground2} 0%, transparent 70%)`,
    'animation': 'omnistore-breathe 9s ease-in-out infinite',
  },
  stageLattice: {
    'position': 'absolute',
    'inset': '0px',
    'display': 'block',
    'width': '100%',
    'height': '100%',
    'color': tokens.colorBrandStroke1,
    'maskImage': 'radial-gradient(ellipse 72% 68% at 62% 50%, black 0%, transparent 74%)',
  },
  stageField: {
    'position': 'relative',
    'width': '100%',
    'height': '100%',
    'animation': 'omnistore-rise 520ms cubic-bezier(0.1,0.9,0.2,1) 140ms both',
  },
  constellation: {
    'display': 'block',
    'width': '100%',
    'height': '100%',
    'color': tokens.colorBrandStroke1,
    ...shorthands.overflow('visible'),
  },
  bobA: {
    animation: 'omnistore-float 8.6s ease-in-out infinite',
  },
  bobB: {
    'animation': 'omnistore-float 7.2s ease-in-out 0.6s infinite',
    '& > path': {
      animationDelay: '140ms',
    },
    '& > circle': {
      animationDelay: '140ms',
    },
  },
  bobC: {
    'animation': 'omnistore-float 9.6s ease-in-out 1.1s infinite',
    '& > path': {
      animationDelay: '280ms',
    },
    '& > circle': {
      animationDelay: '280ms',
    },
  },
  ink: {
    'strokeDasharray': 1,
    animation: 'omnistore-draw 820ms cubic-bezier(0.55,0.05,0.25,1) both',
  },
  rail: {
    'strokeDasharray': 'var(--omnistore-rail-dash)',
    animation: 'omnistore-flow 1.9s linear 1s infinite',
  },
  vertex: {
    animation: 'omnistore-pulse 3.4s ease-in-out infinite',
  },
  // 空态收件盘上方漂浮的两张纸：和箱体同一套漂浮关键帧，周期错开。
  sheetA: {
    animation: 'omnistore-float 6.8s ease-in-out infinite',
  },
  sheetB: {
    'animation': 'omnistore-float 7.6s ease-in-out 0.9s infinite',
    '& > path': {
      animationDelay: '160ms',
    },
  },

  // ---- 01 存储源 / 02 最近文件 的共享目录头 ----
  // 编号 + 名称 + 一条延展细线 + 右侧计数；线是画出来的，不是边框。
  section: {
    'display': 'grid',
    'gridTemplateRows': 'auto minmax(0px, 1fr)',
    'rowGap': tokens.spacingVerticalL,
    'minWidth': '0px',
    'minHeight': '0px',
  },
  sectionHeader: {
    'display': 'flex',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalM,
    'minWidth': '0px',
  },
  sectionIndex: {
    'color': tokens.colorBrandForeground1,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '0.08em',
  },
  sectionTitle: {
    'margin': '0px',
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase400,
    'lineHeight': tokens.lineHeightBase400,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '-0.01em',
    'whiteSpace': 'nowrap',
  },
  sectionRule: {
    'flexGrow': 1,
    'minWidth': '0px',
    'height': tokens.strokeWidthThin,
    'backgroundColor': tokens.colorNeutralStroke2,
    'transformOrigin': 'left center',
    'animation': 'omnistore-rule-grow 640ms cubic-bezier(0.16,1,0.3,1) 100ms both',
  },
  sectionMeta: {
    'flexShrink': 0,
    'color': tokens.colorNeutralForeground3,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'fontVariantNumeric': 'tabular-nums',
    'whiteSpace': 'nowrap',
  },

  // ---- 双栏工作区 ----
  // 左栏是目录牌，右栏是台账。右栏撑满行高，空态因此与左栏等高，
  // 不会在页面上留下半截空白。
  // >4 个源时改走全宽密度目录：源卡片排成 2/3/4 列，最近文件落到下方。
  // 用 data-dense 而不是第二个类 —— 两个类声明同一属性时生效顺序不确定。
  workspace: {
    'display': 'grid',
    'gridTemplateColumns': `minmax(${layout.appHomeSourceColumnMinWidth}, 5fr) minmax(0px, 7fr)`,
    'columnGap': layout.appHomeColumnGap,
    'rowGap': layout.appHomeSectionGap,
    'minWidth': '0px',
    [media.xl]: {
      'gridTemplateColumns': 'minmax(0px, 1fr)',
    },
    '&[data-dense]': {
      'gridTemplateColumns': 'minmax(0px, 1fr)',
    },
  },

  // ---- 存储源：目录牌 ----
  // 1–4 个源：左栏单列大牌；>4 个源：全宽 auto-fit，最小列宽 240px。
  sourceList: {
    'display': 'grid',
    'gridTemplateColumns': `repeat(auto-fit, minmax(min(100%, ${layout.appHomeSourceCardMinWidth}), 1fr))`,
    'alignContent': 'start',
    'gap': tokens.spacingVerticalL,
    'minWidth': '0px',
    '&[data-dense]': {
      'gridTemplateColumns': `repeat(auto-fit, minmax(min(100%, ${layout.appHomeDenseCardMinWidth}), 1fr))`,
      'gap': tokens.spacingVerticalM,
    },
  },
  sourcePlate: {
    'display': 'flex',
    'flexDirection': 'column',
    'alignItems': 'stretch',
    'gap': tokens.spacingVerticalS,
    'width': '100%',
    'minHeight': layout.appHomeSourcePlateMinHeight,
    'padding': tokens.spacingVerticalXXL,
    'textAlign': 'start',
    'cursor': 'pointer',
    'color': tokens.colorNeutralForeground1,
    'fontFamily': 'inherit',
    'backgroundColor': tokens.colorNeutralBackground2,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    'transitionProperty': 'background-color, border-color',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
    'animation': 'omnistore-rise 460ms cubic-bezier(0.16,1,0.3,1) 140ms both',
    '&:hover': {
      'backgroundColor': tokens.colorNeutralBackground2Hover,
      ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
    },
    // 子元素的呼应全部走 data-*：Griffel 类名是哈希，跨元素选不中。
    '&:hover [data-source-index]': {
      color: tokens.colorBrandForeground1,
    },
    '&:hover [data-source-glyph]': {
      transform: 'translateY(-2px)',
    },
    '&:hover [data-open-action]': {
      insetInlineStart: '3px',
    },
    '&:focus-visible': {
      'backgroundColor': tokens.colorNeutralBackground2Hover,
      'outlineOffset': '2px',
    },
    // 密度档：同一张目录牌压到 140px，铭牌、索引、字阶整体收一档；
    // 4 列时仍保留编号语言，只是不再占半屏。
    '&[data-dense]': {
      'minHeight': layout.appHomeDensePlateMinHeight,
      'padding': tokens.spacingVerticalL,
      'gap': tokens.spacingVerticalXS,
      '& [data-source-glyph]': {
        'width': layout.appHomeDenseGlyphSize,
        'height': layout.appHomeDenseGlyphSize,
      },
      '& [data-source-index]': {
        'fontSize': tokens.fontSizeBase500,
        'lineHeight': 1,
      },
      '& [data-source-name]': {
        'marginTop': '0px',
        'fontSize': tokens.fontSizeBase400,
        'lineHeight': tokens.lineHeightBase400,
      },
      '& [data-source-desc]': {
        'display': 'block',
        'fontSize': tokens.fontSizeBase200,
        'lineHeight': tokens.lineHeightBase200,
        ...shorthands.overflow('hidden'),
        'whiteSpace': 'nowrap',
        'textOverflow': 'ellipsis',
      },
      '& [data-source-foot]': {
        'paddingTop': tokens.spacingVerticalM,
        'columnGap': tokens.spacingHorizontalS,
      },
      '& [data-open-action]': {
        'fontSize': tokens.fontSizeBase200,
      },
    },
    [media.sm]: {
      'padding': tokens.spacingVerticalXL,
    },
  },
  sourceTop: {
    'display': 'flex',
    'alignItems': 'flex-start',
    'justifyContent': 'space-between',
    ...shorthands.gap(tokens.spacingHorizontalL),
  },
  sourceGlyph: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'flexShrink': 0,
    'width': layout.appHomeSourceGlyphSize,
    'height': layout.appHomeSourceGlyphSize,
    'color': tokens.colorPaletteDarkOrangeForeground1,
    'backgroundColor': tokens.colorPaletteDarkOrangeBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'transitionProperty': 'transform',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
  },
  // 目录编号是后墙上的印章：mono、32px、低对比；hover 时点亮成品牌色。
  sourceIndex: {
    'color': tokens.colorNeutralForeground4,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeHero800,
    'lineHeight': 1,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '0.02em',
    'fontVariantNumeric': 'tabular-nums',
    'transitionProperty': 'color',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
  },
  sourceName: {
    'marginTop': tokens.spacingVerticalXS,
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase500,
    'lineHeight': tokens.lineHeightBase500,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '-0.01em',
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
  },
  sourceDescription: {
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase300,
    'lineHeight': tokens.lineHeightBase400,
  },
  sourceFoot: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'flexWrap': 'wrap',
    'columnGap': tokens.spacingHorizontalL,
    'rowGap': tokens.spacingVerticalS,
    'marginTop': 'auto',
    'paddingTop': tokens.spacingVerticalL,
    'borderBlockStartWidth': tokens.strokeWidthThin,
    'borderBlockStartStyle': 'solid',
    'borderBlockStartColor': tokens.colorNeutralStroke2,
  },
  sourceCaps: {
    'color': tokens.colorNeutralForeground3,
    'fontFamily': tokens.fontFamilyMonospace,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'letterSpacing': '0.02em',
  },
  openAction: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'gap': tokens.spacingHorizontalXS,
    'position': 'relative',
    'insetInlineStart': '0px',
    'color': tokens.colorBrandForeground1,
    'fontSize': tokens.fontSizeBase300,
    'fontWeight': tokens.fontWeightSemibold,
    'whiteSpace': 'nowrap',
    'transition': 'inset-inline-start 180ms cubic-bezier(0.16,1,0.3,1)',
  },

  // 骨架与目录牌同形：加载完版面不跳。
  sourceSkeletonPlate: {
    'display': 'grid',
    'alignContent': 'start',
    'gap': tokens.spacingVerticalM,
    'minHeight': layout.appHomeSourcePlateMinHeight,
    'padding': tokens.spacingVerticalXXL,
    'backgroundColor': tokens.colorNeutralBackground2,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    '& > span': {
      'display': 'block',
      ...shorthands.borderRadius(tokens.borderRadiusSmall),
      'backgroundImage': `linear-gradient(90deg, ${tokens.colorNeutralBackground1Hover} 25%, ${tokens.colorNeutralStroke2} 50%, ${tokens.colorNeutralBackground1Hover} 75%)`,
      'backgroundSize': '200% 100%',
      'animation': 'omnistore-shimmer 1.4s linear infinite',
    },
    [media.sm]: {
      'padding': tokens.spacingVerticalXL,
    },
  },
  skeletonGlyph: {
    'width': layout.appHomeSourceGlyphSize,
    'height': layout.appHomeSourceGlyphSize,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  skeletonName: {
    'width': '48%',
    'height': tokens.fontSizeBase500,
    'marginTop': tokens.spacingVerticalXS,
  },
  skeletonLine: {
    'width': '76%',
    'height': tokens.fontSizeBase300,
  },
  skeletonFoot: {
    'width': '100%',
    'height': tokens.strokeWidthThick,
    'marginTop': tokens.spacingVerticalXXL,
  },

  // ---- 最近文件：台账 ----
  recentList: {
    'display': 'flex',
    'flexDirection': 'column',
    'maxHeight': layout.appHomeRecentListMaxHeight,
    'minWidth': '0px',
    'overflowY': 'auto',
    'scrollbarGutter': 'stable',
    // 窄屏交给页面本身滚动：手机上的内层滚动条比桌面更难用。
    [media.sm]: {
      'maxHeight': 'none',
      'overflowY': 'visible',
    },
  },
  recentRow: {
    'display': 'grid',
    'gridTemplateColumns': `${layout.appHomeRecentIconPx}px minmax(0px, 1fr) auto ${layout.appHomeRecentActionSize}`,
    'gridTemplateRows': 'auto auto',
    'gridTemplateAreas': '"icon name meta action" "icon path meta action"',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalM,
    'rowGap': tokens.spacingVerticalXXS,
    'paddingBlock': tokens.spacingVerticalM,
    'paddingInline': tokens.spacingHorizontalS,
    'position': 'relative',
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'transitionProperty': 'background-color',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
    'animation': 'omnistore-rise 420ms cubic-bezier(0.16,1,0.3,1) 160ms both',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    // 行分隔线从图标之后起笔：读起来是台账的横行，不是表格边框。
    '&::after': {
      'content': '""',
      'position': 'absolute',
      'insetBlockEnd': '0px',
      'insetInlineStart': `calc(${tokens.spacingHorizontalS} + ${layout.appHomeRecentIconPx}px + ${tokens.spacingHorizontalM})`,
      'insetInlineEnd': tokens.spacingHorizontalS,
      'height': tokens.strokeWidthThin,
      'backgroundColor': tokens.colorNeutralStroke2,
    },
    '&:last-child::after': {
      display: 'none',
    },
    [media.sm]: {
      'gridTemplateColumns': `${layout.appHomeRecentIconPx}px minmax(0px, 1fr) ${layout.appHomeRecentActionSizeTouch}`,
      'gridTemplateRows': 'auto auto auto',
      'gridTemplateAreas': '"icon name action" "icon path action" "icon meta action"',
      'columnGap': tokens.spacingHorizontalS,
      'rowGap': tokens.spacingVerticalXS,
      'paddingInline': tokens.spacingHorizontalXS,
      '&::after': {
        'insetInlineStart': `calc(${tokens.spacingHorizontalXS} + ${layout.appHomeRecentIconPx}px + ${tokens.spacingHorizontalS})`,
      },
    },
  },
  recentIcon: {
    'gridArea': 'icon',
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': `${layout.appHomeRecentIconPx}px`,
    'height': `${layout.appHomeRecentIconPx}px`,
    'flexShrink': 0,
  },
  recentFileName: {
    'gridArea': 'name',
    'width': '100%',
    'maxWidth': '100%',
    ...shorthands.padding(tokens.spacingVerticalXXS, '0px'),
    ...shorthands.borderWidth('0px'),
    'backgroundColor': 'transparent',
    'color': tokens.colorNeutralForeground1,
    'font': 'inherit',
    'fontSize': tokens.fontSizeBase300,
    'lineHeight': tokens.lineHeightBase300,
    'fontWeight': tokens.fontWeightSemibold,
    'textAlign': 'start',
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
    'whiteSpace': 'nowrap',
    'cursor': 'pointer',
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },
    '&:focus-visible': {
      outlineOffset: '2px',
    },
  },
  recentLocation: {
    'gridArea': 'path',
    'display': 'flex',
    'alignItems': 'center',
    'gap': tokens.spacingHorizontalXXS,
    'minWidth': '0px',
    ...shorthands.padding(tokens.spacingVerticalXXS, '0px'),
    ...shorthands.borderWidth('0px'),
    'backgroundColor': 'transparent',
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'textAlign': 'start',
    'cursor': 'pointer',
    ...shorthands.overflow('hidden'),
    'whiteSpace': 'nowrap',
    '&:hover': {
      color: tokens.colorBrandForeground1,
    },
    '&:focus-visible': {
      outlineOffset: '2px',
    },
  },
  recentSource: {
    'minWidth': '0px',
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
  },
  recentPath: {
    'minWidth': '0px',
    'color': tokens.colorNeutralForeground3,
    'fontFamily': tokens.fontFamilyMonospace,
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
  },
  recentMeta: {
    'gridArea': 'meta',
    'display': 'grid',
    'gap': tokens.spacingVerticalXXS,
    'justifySelf': 'end',
    'minWidth': '0px',
    'textAlign': 'end',
    'color': tokens.colorNeutralForeground3,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'fontVariantNumeric': 'tabular-nums',
    '& > span': {
      display: 'block',
      whiteSpace: 'nowrap',
    },
    '& > time': {
      display: 'block',
      whiteSpace: 'nowrap',
    },
    [media.sm]: {
      'display': 'flex',
      'alignItems': 'center',
      'flexWrap': 'wrap',
      'columnGap': tokens.spacingHorizontalS,
      'justifySelf': 'start',
      'textAlign': 'start',
    },
  },
  recentSize: {
    'color': tokens.colorNeutralForeground3,
    'fontFamily': tokens.fontFamilyMonospace,
  },
  recentDownload: {
    'gridArea': 'action',
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': layout.appHomeRecentActionSize,
    'height': layout.appHomeRecentActionSize,
    'flexShrink': 0,
    'color': tokens.colorNeutralForeground3,
    'textDecoration': 'none',
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    'transitionProperty': 'background-color, color',
    'transitionDuration': tokens.durationNormal,
    'transitionTimingFunction': tokens.curveDecelerateMax,
    '&:hover': {
      'color': tokens.colorBrandForeground1,
      'backgroundColor': tokens.colorBrandBackground2,
    },
    '&:focus-visible': {
      'outlineOffset': '1px',
    },
    [media.sm]: {
      'width': layout.appHomeRecentActionSizeTouch,
      'height': layout.appHomeRecentActionSizeTouch,
    },
  },
  recentSkeletonRow: {
    'display': 'grid',
    'gridTemplateColumns': `${layout.appHomeRecentIconPx}px minmax(0px, 1fr) ${layout.appHomeRecentSkeletonMetaWidth}`,
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalM,
    'paddingBlock': tokens.spacingVerticalM,
    'paddingInline': tokens.spacingHorizontalS,
    'borderBlockEndWidth': tokens.strokeWidthThin,
    'borderBlockEndStyle': 'solid',
    'borderBlockEndColor': tokens.colorNeutralStroke2,
    [media.sm]: {
      'gridTemplateColumns': `${layout.appHomeRecentIconPx}px minmax(0px, 1fr)`,
    },
  },
  recentSkeletonIcon: {
    'width': `${layout.appHomeRecentIconPx}px`,
    'height': `${layout.appHomeRecentIconPx}px`,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    'backgroundColor': tokens.colorNeutralStroke2,
  },
  recentSkeletonLines: {
    'display': 'grid',
    'gap': tokens.spacingVerticalS,
    '& > i': {
      'display': 'block',
      ...shorthands.borderRadius(tokens.borderRadiusSmall),
      'backgroundColor': tokens.colorNeutralStroke2,
    },
    '& > i:first-child': {
      'width': '58%',
      'height': tokens.fontSizeBase200,
    },
    '& > i:last-child': {
      'width': '34%',
      'height': tokens.fontSizeBase100,
      'backgroundColor': tokens.colorNeutralBackground1Hover,
    },
  },
  recentSkeletonMeta: {
    'width': layout.appHomeRecentSkeletonMetaWidth,
    'height': tokens.fontSizeBase200,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    'backgroundColor': tokens.colorNeutralBackground1Hover,
    [media.sm]: {
      'display': 'none',
    },
  },

  // ---- 空态：一只等距收件盘 ----
  // 右栏被网格行高撑满时，空态在整块台账区域里居中；有记录时它不会出现。
  recentEmpty: {
    'display': 'flex',
    'flexDirection': 'column',
    'alignItems': 'center',
    'justifyContent': 'center',
    'height': '100%',
    'minHeight': layout.appHomeRecentEmptyMinHeight,
    'maxHeight': layout.appHomeRecentListMaxHeight,
    'paddingBlock': tokens.spacingVerticalXXXL,
    'paddingInline': tokens.spacingHorizontalL,
    'textAlign': 'center',
    'backgroundImage': `radial-gradient(68% 58% at 50% 44%, ${tokens.colorBrandBackground2} 0%, transparent 72%)`,
    'animation': 'omnistore-rise 480ms cubic-bezier(0.16,1,0.3,1) 120ms both',
  },
  emptyArt: {
    'display': 'block',
    'width': layout.appHomeEmptyArtWidth,
    'height': layout.appHomeEmptyArtHeight,
    'marginBottom': tokens.spacingVerticalL,
    'color': tokens.colorBrandStroke1,
  },
  emptyTitle: {
    'margin': '0px',
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase500,
    'lineHeight': tokens.lineHeightBase500,
    'fontWeight': tokens.fontWeightSemibold,
    [media.sm]: {
      'fontSize': tokens.fontSizeBase400,
      'lineHeight': tokens.lineHeightBase400,
    },
  },
  // ---- 无存储源：整页引导 ----
  onboardingPanel: {
    'display': 'grid',
    'gridTemplateColumns': 'minmax(0px, 1fr) auto',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalXXXL,
    'minHeight': layout.appHomeOnboardingMinHeight,
    'padding': layout.statePadding,
    'backgroundColor': tokens.colorNeutralBackground2,
    'backgroundImage': `radial-gradient(90% 130% at 88% 50%, ${tokens.colorBrandBackground2} 0%, transparent 64%)`,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
    ...shorthands.overflow('hidden'),
    'animation': 'omnistore-rise 460ms cubic-bezier(0.16,1,0.3,1) 100ms both',
    [media.md]: {
      'gridTemplateColumns': 'minmax(0px, 1fr)',
    },
  },
  onboardingCopy: {
    'display': 'grid',
    'justifyItems': 'start',
    'minWidth': '0px',
  },
  onboardingTitle: {
    'margin': '0px',
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase600,
    'lineHeight': tokens.lineHeightBase600,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '-0.02em',
    [media.sm]: {
      'fontSize': tokens.fontSizeBase500,
      'lineHeight': tokens.lineHeightBase500,
    },
  },
  onboardingText: {
    'margin': `${tokens.spacingVerticalS} 0px 0px`,
    'maxWidth': '48ch',
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase300,
    'lineHeight': tokens.lineHeightBase400,
  },
  onboardingActions: {
    'display': 'flex',
    'flexWrap': 'wrap',
    'marginTop': tokens.spacingVerticalXXL,
  },
  onboardingArt: {
    'display': 'block',
    'width': layout.appHomeOnboardingArtWidth,
    'height': layout.appHomeOnboardingArtHeight,
    'justifySelf': 'center',
    'color': tokens.colorBrandStroke1,
    [media.md]: {
      'display': 'none',
    },
  },
})
