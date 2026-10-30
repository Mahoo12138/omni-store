import { makeStyles, shorthands, tokens } from '@fluentui/react-components'
import { media } from '../styles/media'
import { layout } from '../styles/layout'

// 公开网盘首页：平铺版面，没有卡片外壳——正文、等距立方体场与事实署名带
// 直接落在页面画布上，只剩「两列 + 一条细线署名带」两层结构。
// 超过 32px 的尺寸全部来自 styles/layout.ts；关键帧全部在 global.css（本页只引用名字），
// 每个动效类只出现一次，彼此不覆盖同一个属性。
//
// 动效分三层：入场编排（一次性，约 1.2s 内跑完）、持续环境动效（只集中在右侧几何场
// 与氛围层，正文保持安静）、指针视差（只作用在几何场）。
export const useStyles = makeStyles({
  entrySection: {
    'position': 'relative',
    'display': 'grid',
    // 报头在上、署名带压在版面底边：平铺之后中间的空，是被这两端「夹住」的呼吸，
    // 而不是一段没用完的卡片内边距。内容比视口高时自然回落成普通流。
    'gridTemplateRows': 'min-content 1fr',
    'flexGrow': 1,
    'minWidth': '0px',
  },

  // ---- 氛围层：等距晶格 + 品牌光晕 + 巡检扫描带 ----
  // 与登录页 AuthForm 的 page::before 同一套做法（极淡网格 + 品牌光晕 + 径向遮罩），
  // 但格子换成等距菱形：整张画布与右侧立方体场落在同一张晶格上。
  // 只向左右出血到页面 gutter，不向上下出血——main 与 footer 是兄弟节点，
  // 定位元素会画在非定位的 footer 之上，纵向出血会脏到页脚。
  ambient: {
    'position': 'absolute',
    'insetBlock': '0px',
    'insetInline': `calc(-1 * ${layout.pageGutter})`,
    'zIndex': 0,
    'overflow': 'hidden',
    'pointerEvents': 'none',
    'animation': 'omnistore-rise 620ms cubic-bezier(0.16,1,0.3,1) both',
    [media.md]: {
      'insetInline': `calc(-1 * ${tokens.spacingHorizontalL})`,
    },
  },
  // 晶格只围绕几何场显影，正文那半边留在干净画布上。
  ambientLattice: {
    'position': 'absolute',
    'inset': '0px',
    'display': 'block',
    'width': '100%',
    'height': '100%',
    'color': tokens.colorBrandStroke1,
    'maskImage': 'radial-gradient(ellipse 58% 54% at 72% 28%, black 0%, transparent 74%)',
  },
  // 光晕压在几何场背后，呼吸只动 opacity/scale，交给合成层。
  ambientGlow: {
    'position': 'absolute',
    'top': '-8%',
    'insetInlineEnd': '-6%',
    'width': '48%',
    'height': '86%',
    'backgroundImage': `radial-gradient(ellipse at 50% 50%, ${tokens.colorBrandBackground2} 0%, transparent 70%)`,
    'animation': 'omnistore-breathe 9s ease-in-out infinite',
    [media.md]: {
      'display': 'none',
    },
  },

  // 两列网格而不是 flex-wrap：flex 换行按「假设主轴尺寸」决定，正文不会先收缩，
  // 结果是中屏宽度下立方体场整块掉到第二行。网格列能保证正文收缩、几何留在右侧。
  // position/zIndex 让它与署名带一起压在氛围层之上。
  entryTop: {
    'position': 'relative',
    'zIndex': 1,
    'display': 'grid',
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    'alignItems': 'center',
    'columnGap': tokens.spacingHorizontalXXXL,
    'rowGap': tokens.spacingVerticalXXL,
    'minWidth': '0px',
    [media.md]: {
      'gridTemplateColumns': 'minmax(0, 1fr)',
    },
  },
  entryCopy: {
    'display': 'grid',
    'justifyItems': 'start',
    'minWidth': '0px',
  },
  // kicker：24px 品牌短线 + 大字距技术标签，替代原先的图标砖。
  kicker: {
    'display': 'inline-flex',
    'alignItems': 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    'color': tokens.colorBrandForeground1,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'fontWeight': tokens.fontWeightSemibold,
    'letterSpacing': '0.08em',
    ...shorthands.margin('0px', '0px', tokens.spacingVerticalM),
    '&::before': {
      'content': '""',
      'width': '24px',
      'height': tokens.strokeWidthThick,
      'flexShrink': 0,
      'backgroundColor': tokens.colorCompoundBrandBackground,
      'transformOrigin': 'left center',
      'animation': 'omnistore-rule-grow 480ms cubic-bezier(0.16,1,0.3,1) both',
    },
  },
  riseKicker: {
    'animation': 'omnistore-rise 400ms cubic-bezier(0.1,0.9,0.2,1) both',
  },
  // 标题遮罩。下边距必须挂在遮罩上而不是 h1 上：overflow hidden 让遮罩成为 BFC，
  // h1 的下边距会被算进遮罩高度，108% 的位移就盖不住字，起手会露出几像素。
  titleMask: {
    'display': 'block',
    'overflow': 'hidden',
    'maxWidth': '100%',
    ...shorthands.margin('0px', '0px', tokens.spacingVerticalM),
  },
  // 平铺之后标题承担整页的重量：宽屏用 Hero1000 做报头，中窄屏逐档回落。
  entryTitle: {
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeHero1000,
    'lineHeight': '1.04',
    'fontWeight': tokens.fontWeightBold,
    'letterSpacing': '-0.045em',
    ...shorthands.margin('0px'),
    'textWrap': 'balance',
    'animation': 'omnistore-mask-rise 620ms cubic-bezier(0.16,1,0.3,1) 80ms both',
    [media.xl]: {
      'fontSize': tokens.fontSizeHero900,
      'lineHeight': tokens.lineHeightHero900,
      'letterSpacing': '-0.03em',
    },
    [media.md]: {
      'fontSize': tokens.fontSizeHero800,
      'lineHeight': tokens.lineHeightHero800,
    },
    [media.sm]: {
      'fontSize': tokens.fontSizeHero700,
      'lineHeight': tokens.lineHeightHero700,
    },
  },
  entryLead: {
    'color': tokens.colorNeutralForeground2,
    'fontSize': tokens.fontSizeBase500,
    'lineHeight': tokens.lineHeightBase500,
    'maxWidth': layout.entryCopyMaxWidth,
    ...shorthands.margin('0px'),
    'textWrap': 'pretty',
    'animation': 'omnistore-rise 420ms cubic-bezier(0.1,0.9,0.2,1) 120ms both',
    [media.xl]: {
      'fontSize': tokens.fontSizeBase400,
      'lineHeight': tokens.lineHeightBase500,
    },
    [media.sm]: {
      'fontSize': tokens.fontSizeBase300,
      'lineHeight': tokens.lineHeightBase400,
    },
  },
  // CTA 的箭头在 hover 时向前送一格。规则挂在行容器上而不是 Button 上：
  // 实测一个只含嵌套选择器的 makeStyles slot，类串解析正常、落在普通 div 上生效，
  // 但作为 className 传进 Fluent Button 会被整组丢掉（Login 的 submit 有顶层声明，能落地）。
  // 位移走 inset-inline-start 而不是 translateX —— 物理 transform 会被 Griffel 的 RTL
  // 处理翻成一对互相抵消的原子类，逻辑属性只出一份规则。
  entryActions: {
    'display': 'flex',
    'alignItems': 'center',
    'flexWrap': 'wrap',
    'columnGap': tokens.spacingHorizontalL,
    'rowGap': tokens.spacingHorizontalS,
    'marginTop': tokens.spacingVerticalXXXL,
    'animation': 'omnistore-rise 420ms cubic-bezier(0.1,0.9,0.2,1) 180ms both',
    '& > button svg': {
      'position': 'relative',
      'transition': 'inset-inline-start 260ms cubic-bezier(0.16,1,0.3,1)',
    },
    '& > button:hover svg': {
      'insetInlineStart': '3px',
    },
  },

  // 事实署名带：与状态面同一条底线节奏；mono 只给路径与技术值。
  // 状态胶囊挂在最右端，整条带子读起来是「这一页的落款」。
  entryFacts: {
    'position': 'relative',
    'zIndex': 1,
    'display': 'flex',
    'alignItems': 'flex-end',
    'flexWrap': 'wrap',
    'columnGap': tokens.spacingHorizontalXL,
    'rowGap': tokens.spacingVerticalL,
    'marginTop': tokens.spacingVerticalXXXL,
    'paddingTop': tokens.spacingVerticalXL,
    'alignSelf': 'end',
    // 上沿细线改成独立画出的伪元素：border 没法做 scaleX 的 draw-in。
    '&::before': {
      'content': '""',
      'position': 'absolute',
      'insetBlockStart': '0px',
      'insetInline': '0px',
      'height': tokens.strokeWidthThin,
      'backgroundColor': tokens.colorNeutralStroke2,
      'transformOrigin': 'left center',
      'animation': 'omnistore-rule-grow 640ms cubic-bezier(0.16,1,0.3,1) 260ms both',
    },
    // 逐项落位：线画完，事实一条条压上来。时序集中在这一处，元素上不再挂 inline delay。
    '& > *:nth-child(2)': {
      'animationDelay': '320ms',
    },
    '& > *:nth-child(3)': {
      'animationDelay': '370ms',
    },
    '& > *:nth-child(4)': {
      'animationDelay': '420ms',
    },
    '& > *:nth-child(5)': {
      'animationDelay': '470ms',
    },
  },
  fact: {
    'display': 'grid',
    'gap': tokens.spacingVerticalXXS,
    'minWidth': '0px',
    'paddingInlineStart': tokens.spacingHorizontalXL,
    'borderInlineStartWidth': tokens.strokeWidthThin,
    'borderInlineStartStyle': 'solid',
    'borderInlineStartColor': tokens.colorNeutralStroke2,
    'animation': 'omnistore-rise 460ms cubic-bezier(0.16,1,0.3,1) 280ms both',
    '&:first-child': {
      'paddingInlineStart': '0px',
      'borderInlineStartWidth': '0px',
    },
    [media.xs]: {
      'paddingInlineStart': '0px',
      'borderInlineStartWidth': '0px',
    },
  },
  factLabel: {
    'color': tokens.colorNeutralForeground3,
    'fontSize': tokens.fontSizeBase200,
    'lineHeight': tokens.lineHeightBase200,
    'letterSpacing': '0.06em',
  },
  factValue: {
    'color': tokens.colorNeutralForeground1,
    'fontSize': tokens.fontSizeBase300,
    'lineHeight': tokens.lineHeightBase400,
    'fontWeight': tokens.fontWeightSemibold,
    ...shorthands.margin('0px'),
    ...shorthands.overflow('hidden'),
    'textOverflow': 'ellipsis',
  },
  factMono: {
    'fontFamily': tokens.fontFamilyMonospace,
    'fontWeight': tokens.fontWeightRegular,
    'letterSpacing': '-0.01em',
  },
  factStatus: {
    'marginInlineStart': 'auto',
    'animation': 'omnistore-rise 460ms cubic-bezier(0.16,1,0.3,1) 280ms both',
    // 窄屏上事实带已占满一行，状态胶囊跟到最左，避免孤零零挂在右侧。
    [media.xs]: {
      'marginInlineStart': '0px',
    },
  },

  // ---- 右侧等距立方体场 ----
  // 视差层：JS 每帧只写 transform，CSS transition 负责追赶，读起来是「浮在页面之上」。
  // 入场位移挂在里层（fieldRise），两层各占一个 transform，互不覆盖。
  fieldParallax: {
    'transition': 'transform 600ms cubic-bezier(0.16,1,0.3,1)',
    'willChange': 'transform',
  },
  fieldRise: {
    'animation': 'omnistore-rise 520ms cubic-bezier(0.1,0.9,0.2,1) 140ms both',
  },
  // 立方体场：几何色用 brandStroke1（深浅两档都是可读的品牌蓝），淡出写在
  // SVG 的 stroke/fill opacity 上——元素 opacity 会和入场动画互相覆盖。
  entryField: {
    'width': layout.entryFieldWidth,
    'height': layout.entryFieldHeight,
    'flexShrink': 0,
    'color': tokens.colorBrandStroke1,
    'pointerEvents': 'none',
    [media.md]: {
      'display': 'none',
    },
  },
  // 三只箱各自漂浮：同一条 -6px 关键帧，靠不同周期与起手相位错开，读起来是
  // 「各自悬着」而不是整块平移。子元素的自绘延迟也在这一层给，路径上不再挂 inline style。
  bobMain: {
    animation: 'omnistore-float 7.6s ease-in-out infinite',
  },
  bobSide: {
    'animation': 'omnistore-float 9.2s ease-in-out 0.7s infinite',
    '& > path:not([data-rail])': {
      'animationDelay': '170ms',
    },
    '& > circle': {
      'animationDelay': '170ms',
    },
  },
  bobFar: {
    'animation': 'omnistore-float 6.4s ease-in-out 1.2s infinite',
    '& > path': {
      'animationDelay': '310ms',
    },
    '& > circle': {
      'animationDelay': '310ms',
    },
  },
  // 线稿自绘：pathLength="1" 把每条路径的长度归一，于是「dasharray 1 + 一条关键帧」
  // 就能让长短不一的路径都恰好画一遍，不必逐条量长度。
  ink: {
    'strokeDasharray': 1,
    'animation': 'omnistore-draw 760ms cubic-bezier(0.55,0.05,0.25,1) both',
  },
  // 轨道虚线：dash 周期取自 global.css 的变量，与 omnistore-flow 的位移量同源。
  rail: {
    'strokeDasharray': 'var(--omnistore-rail-dash)',
    'animation': 'omnistore-flow 1.9s linear 1s infinite',
  },
  vertex: {
    animation: 'omnistore-pulse 3.4s ease-in-out infinite',
  },

  // 骨架与真实版面同形：同一块入口板、同一条署名带，加载完不跳动。
  // 微光只挂在容器的 `& > span` 上，尺寸类不再和它争同一个属性。
  skeletonBars: {
    'display': 'grid',
    'justifyItems': 'start',
    'minWidth': '0px',
    '& > span': {
      'display': 'block',
      ...shorthands.borderRadius(tokens.borderRadiusSmall),
      'backgroundImage': `linear-gradient(90deg, ${tokens.colorNeutralBackground1Hover} 25%, ${tokens.colorNeutralStroke2} 50%, ${tokens.colorNeutralBackground1Hover} 75%)`,
      'backgroundSize': '200% 100%',
      'animation': 'omnistore-shimmer 1.4s linear infinite',
    },
  },
  skeletonKicker: {
    'width': '22ch',
    'height': tokens.lineHeightBase200,
    'marginBottom': tokens.spacingVerticalM,
  },
  skeletonTitle: {
    'width': '30%',
    'height': tokens.fontSizeHero1000,
    'marginBottom': tokens.spacingVerticalM,
  },
  skeletonLine: {
    'width': '52ch',
    'height': tokens.lineHeightBase500,
  },
  skeletonLineShort: {
    'width': '36ch',
    'height': tokens.lineHeightBase500,
  },
  skeletonActions: {
    'width': '16ch',
    'height': tokens.lineHeightHero800,
    'marginTop': tokens.spacingVerticalXXXL,
  },
  skeletonField: {
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
    'backgroundImage': `linear-gradient(90deg, ${tokens.colorNeutralBackground1Hover} 25%, ${tokens.colorNeutralStroke2} 50%, ${tokens.colorNeutralBackground1Hover} 75%)`,
    'backgroundSize': '200% 100%',
    'animation': 'omnistore-shimmer 1.4s linear infinite',
  },
})
