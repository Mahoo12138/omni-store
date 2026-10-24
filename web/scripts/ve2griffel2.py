#!/usr/bin/env python3
"""VE→griffel 转换(v3):按顶层逗号拆分对象,逐对转换。

用法: python3 scripts/ve2griffel2.py <X.css.ts> ...
生成 X.styles.ts;调用方需把 `import * as css from './X.css'` 换成
`import { useStyles } from './X.styles'` 并在组件体首行加 `const css = useStyles()`。
输出带 TODO 注释的行(跨文件组合/别名/非类 globalStyle)需人工处理。
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ve2griffel import replace_vars  # noqa: E402

SHORTHANDS = {
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
    'padding', 'paddingInline', 'paddingBlock',
    'margin', 'marginInline', 'marginBlock',
    'inset', 'gap', 'overflow', 'placeItems', 'placeContent', 'transition',
    'flexFlow', 'gridArea', 'overscrollBehavior', 'scrollPadding',
}

def strip_braces(s: str) -> str:
    """只剥最外层一层花括号(避免 strip('{}') 把多个尾部 } 全剥掉)"""
    s = s.strip()
    if s.startswith('{') and s.endswith('}'):
        return s[1:-1]
    return s

def split_top(s: str) -> list[str]:
    """按顶层逗号拆分(括号/引号感知)"""
    parts, depth, quote, cur = [], 0, None, ''
    for ch in s:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
            continue
        if ch in '\'"`':
            quote = ch
            cur += ch
        elif ch in '{[(':
            depth += 1
            cur += ch
        elif ch in '}])':
            depth -= 1
            cur += ch
        elif ch == ',' and depth == 0:
            if cur.strip():
                parts.append(cur.strip())
            cur = ''
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts

def parse_pair(p: str):
    m = re.match(r"^(?:'([^']*)'|\"([^\"]*)\"|([A-Za-z][A-Za-z0-9-]*))\s*:\s*(.+)$", p, re.S)
    if not m:
        return None
    return (m.group(1) or m.group(2) or m.group(3)), m.group(4).rstrip(',').strip()

NO_UNIT = {'lineHeight', 'fontWeight', 'zIndex', 'flex', 'opacity', 'order', 'flexGrow', 'flexShrink'}

def fix_number(key: str, val: str) -> str:
    """纯数字值默认加 px(ve 数字即 px);无单位属性保持数字"""
    if re.fullmatch(r'-?\d+(\.\d+)?', val) and key not in NO_UNIT:
        return f"'{val}px'"
    return val

def conv_pairs(body: str, indent: str) -> str:
    """对象体文本 → griffel 条目行(每行一个属性,紧凑风格)"""
    out = []
    for pair in split_top(strip_braces(body).strip()):
        parsed = parse_pair(pair)
        if not parsed:
            out.append(f'{indent}// TODO 未解析: {pair}')
            continue
        key, val = parsed
        if key == 'selectors':
            for k2, v2 in (parse_pair(x) for x in split_top(strip_braces(val))):
                if k2:
                    k2n = k2.strip().strip('\'"')
                    out.append(f"{indent}'{k2n}': {{")
                    out.append(conv_pairs(strip_braces(v2), indent + '  '))
                    out.append(f'{indent}}},')
            continue
        if key == '@media':
            for k2, v2 in (parse_pair(x) for x in split_top(strip_braces(val))):
                q = k2.strip().strip('\'"')
                out.append(f"{indent}'@media {q}': {{")
                out.append(conv_pairs(v2, indent + '  '))
                out.append(f'{indent}}},')
            continue
        if key in SHORTHANDS:
            out.append(f'{indent}...shorthands.{key}({fix_number(key, val)}),')
        else:
            out.append(f"{indent}'{key}': {fix_number(key, val)},")
    return '\n'.join(out)

def read_balanced(lines, i, text_start):
    depth, started, buf, first = 0, False, '', True
    while i < len(lines):
        seg = text_start if first else lines[i]
        first = False
        buf += seg
        for ch in seg:
            if ch in '([{':
                depth += 1
                started = True
            elif ch in ')]}':
                depth -= 1
        if started and depth <= 0:
            return buf, i
        buf += '\n'
        i += 1
    return buf, len(lines) - 1

def main(path: Path):
    src = replace_vars(path.read_text())
    lines = src.split('\n')
    entries, manual = [], []
    pending: dict[str, list[str]] = {}

    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        m = re.match(r"export const (\w+) = styleVariants\(", line)
        if m:
            buf, end = read_balanced(lines, i, line[line.index('styleVariants(') + 14:])
            inner = buf.rstrip()
            if inner.endswith(')'):
                inner = inner[:-1]
            for pair in split_top(strip_braces(inner)):
                parsed = parse_pair(pair)
                if not parsed:
                    continue
                vk, vv = parsed
                name = vk.strip().strip('\'"')
                bodyv = vv.strip()
                ma = re.match(r'^\[\s*(\w+)\s*,\s*(\{.*)\]$', bodyv, re.S)
                if ma:
                    if ma.group(1) in ('outlineList', 'outlineTab', 'outlineIconTab'):
                        manual.append(f'{m.group(1)}_{name} 组合跨文件基类 {ma.group(1)},需 mergeClasses 或复制属性')
                    bodyv = ma.group(2)
                bodyv = strip_braces(bodyv).strip()
                entries.append((f'{m.group(1)}_{name}', conv_pairs(bodyv, '  ')))
            i = end + 1
            continue
        m = re.match(r"export const (\w+) = style\(", line)
        if m:
            buf, end = read_balanced(lines, i, line[line.index('style(') + 6:])
            inner = buf.rstrip()
            if inner.endswith(')'):
                inner = inner[:-1]
            inner = inner.strip()
            ma = re.match(r'^\[\s*(\w+)\s*,\s*(\{.*)\]$', inner, re.S)
            if ma:
                base = ma.group(1)
                if base in ('outlineList', 'outlineTab', 'outlineIconTab'):
                    manual.append(f'{m.group(1)} 组合跨文件基类 {base}')
                inner = ma.group(2)
                manual.append(f'{m.group(1)} 组合本文件 {base}:需把基类属性复制进来(仅 hover 态覆盖时,可只保留差异)')
            elif re.fullmatch(r'\w+', inner):
                manual.append(f'{m.group(1)} = {inner} 基别名(跨文件),调用方改用 mergeClasses')
                i = end + 1
                continue
            entries.append((m.group(1), conv_pairs(strip_braces(inner).strip(), '  ')))
            i = end + 1
            continue
        m = re.match(r"globalStyle\(", line)
        if m:
            buf, end = read_balanced(lines, i, line[len('globalStyle('):])
            mm = re.match(r"\s*`([^`]*)`\s*,\s*(\{.*\})\s*$", buf, re.S)
            if mm:
                target, decls = mm.group(1), mm.group(2).strip()
                tm = re.match(r'^\$\{(\w+)\}(.*)$', target)
                if tm:
                    base, rest = tm.group(1), tm.group(2).strip()
                    sel = '&' + ((' ' + rest) if rest else '')
                    pending.setdefault(base, []).append(conv_pairs(strip_braces(decls).strip(), '    ')
                                                       .replace('    ', "    '", 1))
                    # 上面 replace 处理首个键加引号不可靠,直接生成原始形态:
                    pending[base][-1] = f"'{sel}': {{\n{conv_pairs(decls.strip().strip(chr(123)+chr(125)).strip(), '    ')}\n  }}"
                else:
                    manual.append(f'globalStyle 非类目标: {target} → {decls[:60]}')
            i = end + 1
            continue
        i += 1

    blocks = []
    for name, body in entries:
        extra = pending.get(name)
        inner = body + (('\n    ' + ',\n    '.join(extra) + ',') if extra else '')
        blocks.append(f'  {name}: {{\n{inner}\n  }}')
    out = path.with_suffix('').with_suffix('.styles.ts')
    ts = "import { makeStyles, shorthands } from '@fluentui/react-components'\n\n"
    if manual:
        ts += '// TODO(人工复核):\n' + '\n'.join(f'// - {x}' for x in manual) + '\n\n'
    ts += 'export const useStyles = makeStyles({\n' + ',\n'.join(blocks) + ',\n})\n'
    out.write_text(ts)
    print(('WROTE ' + str(out).split('/')[-1]) + (' | MANUAL: ' + '; '.join(manual) if manual else ' | clean'))

if __name__ == '__main__':
    for a in sys.argv[1:]:
        main(Path(a))
