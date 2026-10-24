#!/usr/bin/env python3
"""一次性迁移工具:把 vanilla-extract 的 .css.ts 转成 griffel 的 .styles.ts。

- vars.token 引用替换为 Fluent CSS 变量/字面量(与 theme.css.ts 桥接值一致)
- style()/styleVariants()/组合数组 → makeStyles 对象
- globalStyle(类目标) 并入对应类的 '& ...' 选择器;非类目标输出 .global.css
- '@media': {q: {...}} → '@media q': {...};selectors 平铺
转换结果需人工复核(复杂文件会有边角),调用方需把
  import * as css from './X.css'  →  import { useStyles } from './X.styles' + 组件内 const css = useStyles()
"""
import re
import sys
from pathlib import Path

VARS: dict[str, str] = {
    'color.primary': 'var(--colorBrandBackground)',
    'color.primaryHover': 'var(--colorBrandBackgroundHover)',
    'color.primaryActive': 'var(--colorBrandBackgroundPressed)',
    'color.primarySubtle': 'var(--colorBrandBackground2)',
    'color.primarySubtleInk': 'var(--colorBrandForeground1)',
    'color.background': 'var(--colorNeutralBackground2)',
    'color.surface': 'var(--colorNeutralBackground1)',
    'color.surfaceHover': 'var(--colorNeutralBackground1Hover)',
    'color.border': 'var(--colorNeutralStroke2)',
    'color.borderStrong': 'var(--colorNeutralStroke1)',
    'color.text': 'var(--colorNeutralForeground1)',
    'color.textSecondary': 'var(--colorNeutralForeground2)',
    'color.textOnPrimary': 'var(--colorNeutralForegroundOnBrand)',
    'color.success': 'var(--colorPaletteGreenForeground1)',
    'color.successSubtle': 'var(--colorPaletteGreenBackground1)',
    'color.danger': 'var(--colorPaletteRedForeground1)',
    'color.dangerHover': 'var(--colorPaletteRedForeground1)',
    'color.dangerSubtle': 'var(--colorPaletteRedBackground1)',
    'color.warning': 'var(--colorPaletteYellowForeground1)',
    'space.xs': '4px', 'space.sm': '8px', 'space.md': '16px', 'space.lg': '24px', 'space.xl': '40px',
    'radius.sm': 'var(--borderRadiusSmall)', 'radius.md': 'var(--borderRadiusMedium)',
    'radius.lg': 'var(--borderRadiusLarge)', 'radius.tile': 'var(--borderRadiusMedium)', 'radius.full': '999px',
    'shadow.sm': 'var(--shadow4)', 'shadow.md': 'var(--shadow16)',
    'fontSize.xs': '12px', 'fontSize.sm': '13px', 'fontSize.md': '14px', 'fontSize.lg': '16px',
    'fontSize.xl': '20px', 'fontSize.xxl': '24px', 'fontSize.display': '32px',
    'font.body': 'var(--fontFamilyBase)', 'font.mono': 'var(--fontFamilyMonospace)',
    'zIndex.dropdown': '10', 'zIndex.sticky': '20', 'zIndex.backdrop': '30', 'zIndex.modal': '40', 'zIndex.toast': '50',
    'motion.fast': 'var(--durationNormal)', 'motion.base': 'var(--durationSlower)', 'motion.ease': 'var(--curveDecelerateMax)',
    'color.tileBlueBg': 'oklch(0.94 0.045 262)',
    'color.tileBlueFg': 'oklch(0.55 0.2 262)',
    'color.tileGreenBg': 'oklch(0.94 0.05 150)',
    'color.tileGreenFg': 'oklch(0.52 0.14 150)',
    'color.tileAmberBg': 'oklch(0.95 0.05 80)',
    'color.tileAmberFg': 'oklch(0.6 0.13 70)',
    'color.tilePurpleBg': 'oklch(0.94 0.045 300)',
    'color.tilePurpleFg': 'oklch(0.53 0.17 300)',
    'color.tileTealBg': 'oklch(0.94 0.05 200)',
    'color.tileTealFg': 'oklch(0.52 0.11 210)',
    'color.tileRedBg': 'oklch(0.94 0.035 27)',
    'color.tileRedFg': 'oklch(0.55 0.19 27)',
}

def replace_vars(src: str) -> str:
    # 按 key 长度降序,避免前缀污染(text 吃掉 textSecondary);
    # 模板串内替换不加引号,独立值位置替换为带引号字符串
    for k in sorted(VARS, key=len, reverse=True):
        src = src.replace('${vars.%s}' % k, VARS[k])
        src = src.replace('vars.%s' % k, "'%s'" % VARS[k])
    return src

def flatten_media(sel_block: str) -> str:
    """'@media': { q: {...} } → '@media q': {...}"""
    return sel_block

def transform(path: Path) -> None:
    src = replace_vars(path.read_text())
    lines = src.split('\n')

    classes: dict[str, list[str]] = {}   # name -> 段落(尚未收集选择器合并)
    globals_css: list[str] = []
    out_order: list[str] = []

    # 逐段扫描顶层声明
    i = 0
    n = len(lines)
    def block_end(start: int) -> int:
        depth = 0
        started = False
        j = start
        while j < n:
            for ch in lines[j]:
                if ch in '([{': depth += 1; started = True
                elif ch in ')]}': depth -= 1
            if started and depth <= 0:
                return j
            j += 1
        return n

    def selectors_flat(body: str) -> str:
        # 去掉 selectors 包装层:  selectors: { A: X } → A: X(保持缩进粗调)
        def repl(m):
            inner = m.group(1)
            return inner
        return re.sub(r'selectors:\s*\{', repl, body)

    while i < n:
        line = lines[i]
        m = re.match(r'export const (\w+) = (style|styleVariants)\(', line)
        if m:
            name, kind = m.group(1), m.group(2)
            end = block_end(i)
            body = '\n'.join(lines[i:end+1])
            body = body[len(m.group(0)):].rstrip()
            if body.endswith(')'):
                body = body[:-1]
            out_order.append(name)
            classes[name] = body
            i = end + 1
            continue
        m = re.match(r'export const (\w+) = style\(', line)
        if m:
            end = block_end(i)
            body = '\n'.join(lines[i:end+1])
            body = body[len(m.group(0)):].rstrip()
            if body.endswith(')'):
                body = body[:-1]
            out_order.append(m.group(1))
            classes[m.group(1)] = body
            i = end + 1
            continue
        m = re.match(r'globalStyle\(', line)
        if m:
            end = block_end(i)
            body = '\n'.join(lines[i:end+1])[len(m.group(0)):]
            # target, styles 两参
            mm = re.match(r'\s*(`[^`]*`|\'[^\']*\')\s*,', body)
            if mm:
                target = mm.group(1)[1:-1]
            else:
                target = 'UNKNOWN'
            # 判断目标是否是“单个类 + 后续选择器”
            tm = re.match(r'^\$\{(\w+)\}(.*)$', target)
            if tm:
                base, rest = tm.group(1), tm.group(2).strip()
                if base in classes:
                    key = ('&' + (' ' + rest if rest else '')) if rest else '&'
                    # 追加选择器块
                    decl = body[mm.end():].rstrip()
                    if decl.endswith(')'):
                        decl = decl[:-1]
                    classes[base] += f",\n  '{key}': {decl.strip()}"
                    i = end + 1
                    continue
            # 非类目标 → 全局 css
            decl = body[mm.end():].rstrip() if mm else body
            if decl.endswith(')'):
                decl = decl[:-1]
            globals_css.append(f'/* {target} */ {decl.strip()}')
            i = end + 1
            continue
        i += 1

    # 组装 makeStyles
    parts = []
    for name in out_order:
        parts.append(f'  {name}: {{{classes[name]}}}')
    ts = "import { makeStyles } from '@fluentui/react-components'\n\n"
    ts += '// 由 ve2griffel 转换,请复核:selectors 已平铺、media 已平铺、vars 已换 Fluent 变量\n'
    ts += 'export const useStyles = makeStyles({\n' + ',\n'.join(parts) + ',\n})\n'
    out = path.with_suffix('').with_suffix('.styles.ts')  # X.css.ts -> X.styles.ts
    out.write_text(ts)
    print('WROTE', out)
    if globals_css:
        g = path.with_suffix('').with_suffix('.global.css')
        g.write_text('/* 由 ve2griffel 迁移的全局选择器(目标非单类),请复核 */\n' + '\n'.join(globals_css) + '\n')
        print('GLOBAL', g)

if __name__ == '__main__':
    for arg in sys.argv[1:]:
        transform(Path(arg))
