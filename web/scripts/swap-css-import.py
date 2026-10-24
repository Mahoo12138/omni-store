#!/usr/bin/env python3
"""把 tsx 的 `import * as css from './X.css'` 切换到 X.styles 的 hook,
并在每个引用了 css. 的顶层函数组件体首行注入 `const css = useStyles()`。
"""
import re
import sys
from pathlib import Path

def main(path: str, css_import: str, styles_import: str):
    p = Path(path)
    s = p.read_text()
    assert css_import in s, f'{path}: import not found: {css_import}'
    s = s.replace(css_import, styles_import, 1)

    lines = s.split('\n')
    out = []
    i = 0
    injected = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.match(r'^(export )?function \w+\(', line)
        if m:
            # 找函数体首行(签名可能跨行,直到 '{' 结尾)
            j = i
            sig = line
            while not re.search(r'\{\s*$', sig) and j + 1 < len(lines):
                j += 1
                sig += '\n' + lines[j]
            # 函数体范围:到下一个顶层 '}' 或 'function'
            k = j + 1
            body_lines = []
            while k < len(lines) and not re.match(r'^}', lines[k]) and not re.match(r'^(export )?function', lines[k]):
                body_lines.append(lines[k])
                k += 1
            body = '\n'.join(body_lines)
            if re.search(r'\bcss\.', body):
                # 在 j 行(签名尾)后注入
                for jj in range(i + 1, j + 1):
                    out.append(lines[jj])
                indent = '  '
                out.append(f'{indent}const css = useStyles()')
                injected += 1
                i = j
            else:
                for jj in range(i + 1, j + 1):
                    out.append(lines[jj])
                i = j
        i += 1
    p.write_text('\n'.join(out))
    print(f'{path}: injected {injected}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
