// 32px 天花板之外的尺寸常量。
//
// Fluent 的间距 token 最大只到 spacingHorizontalXXXL / spacingVerticalXXXL = 32px
// (实测 webLightTheme:0/2/4/6/8/10/12/16/20/24/32)。侧栏宽度、版面最大宽度、页面外边距
// 这类结构性尺寸超过 32px,只能用显式值 —— 集中在这里,别处不再出现裸 px。
//
// 同 media.ts:本文件被构建期 AOT 求值,必须保持纯 JS 语法。
export const layout = {
  // 应用外壳
  sidebarWidth: '240px',
  navRailHeight: '52px',
  contentMaxWidth: '1440px',
  contentMaxWideWidth: '1600px',

  // 页面度量
  pageGutter: 'clamp(28px, 4vw, 72px)',
  pageGutterWide: 'clamp(20px, 2vw, 32px)',
  readingMaxWidth: '68ch',
  stateMinHeight: '270px',

  // 弹层。数值用 px 结尾的数字形式：同一常量既喂 CSS（`${x}px`），
  // 也喂 Fluent 组件的数值 props（如 Toaster 的 offset），只有一处事实。
  dialogWidthPx: 480,
  dialogWideWidthPx: 640,
  toastMaxWidthPx: 420,
  toastOffsetPx: 24,
  toastGapPx: 8,
  // 浮层与视口边缘的最小留白（窄屏上弹窗/任务卡不得贴边）。
  viewportInsetPx: 32,

  // 堆叠层级(仅外壳与浮层允许,其余页面写 zIndex 说明堆叠模型已被破坏)
  // 预览弹层的 40 在 global.css 的 --omnistore-z-preview（plain CSS 读不到本文件）。
  zIndexSidebar: 20,
  zIndexDialog: 40,
  zIndexTaskLayer: 50,
}
