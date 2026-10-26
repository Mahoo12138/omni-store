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
  sidebarCompactHeight: '52px',
  contentMaxWidth: '1440px',
  contentMaxWideWidth: '1600px',

  // 页面度量
  pageGutter: 'clamp(28px, 4vw, 72px)',
  pageGutterWide: 'clamp(20px, 2vw, 32px)',
  readingMaxWidth: '68ch',
  stateMinHeight: '270px',

  // 弹层
  dialogWidth: '480px',
  dialogWideWidth: '640px',
  toastMaxWidth: '420px',
  toastOffset: '24px',

  // 堆叠层级(仅外壳与浮层允许,其余页面写 zIndex 说明堆叠模型已被破坏)
  zIndexSidebar: 20,
}
