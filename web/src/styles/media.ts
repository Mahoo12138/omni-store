// 全站唯一的响应式档位源。
//
// 本文件会在构建期被 griffel AOT(@griffel/vite-plugin → wyw-in-js)求值,因此必须保持
// 纯 JS 语法:不写 `as const`、不写类型注解、不 import 任何运行时依赖。
//
// 已实测(vite build + dist 产物核对):导入常量既能作样式「值」,也能作 makeStyles 的
// 「计算键」—— { [media.sm]: {...} } 会正确产出 @media screen and (max-width: 640px) 规则。
// 所以样式里一律写 [media.*],不再出现手抄的 @media 字符串;JS 侧的查询串用 compactQuery。
//
// 档位只有 6 个。新增一档前先判断它是不是组件内部的局部重排 —— 那种情况用容器查询
// (键必须写成扁平形式 '@container <name> (max-width: …px)',嵌套对象形式会产出非法 at-rule)。
export const breakpoints = {
  xs: 480,
  sm: 640,
  md: 820,
  lg: 980,
  xl: 1200,
  xxl: 1400,
}

// makeStyles 的 @media 键位。值与 breakpoints 一一对应,改档位只改这一处。
export const media = {
  xs: '@media screen and (max-width: 480px)',
  sm: '@media screen and (max-width: 640px)',
  md: '@media screen and (max-width: 820px)',
  lg: '@media screen and (max-width: 980px)',
  xl: '@media screen and (max-width: 1200px)',
  xxl: '@media screen and (max-width: 1400px)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
  coarsePointer: '@media (pointer: coarse)',
}

// JS 侧(matchMedia / useIsCompact)用的查询串,必须与 media.md 同一事实源。
export const compactQuery = '(max-width: 820px)'
