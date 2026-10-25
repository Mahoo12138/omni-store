#!/usr/bin/env python3
"""在生成后的 .styles.ts 上合并组合样式:把基类块正文拼到子类块前,并去 TODO 头。
用法: python3 scripts/merge-combos.py <styles.ts> BaseName:ChildName ...
键名带不带引号都能匹配。
"""
import re
import sys
from pathlib import Path

def body_of(s, name):
    m = re.search(r"^  ['\"]?" + name + r"['\"]?: \{\n", s, re.M)
    if not m:
        return None
    i = m.end()
    depth = 1
    while depth > 0:
        ch = s[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        i += 1
    return s[m.end():i-1].rstrip().rstrip(',')

def main(path, pairs):
    p = Path(path)
    s = p.read_text()
    for pair in pairs:
        base, child = pair.split(':')
        b = body_of(s, base)
        assert b is not None, f'{path}: base {base} not found'
        if re.search(r"^  ['\"]?" + child + r"['\"]?: \{", s, re.M):
            s = re.sub(r"^  ['\"]?" + child + r"['\"]?: \{\n", lambda _: '  ' + child + ': {\n' + b + ',\n', s, count=1, flags=re.M)
    s = re.sub(r'// TODO\(人工复核\):\n(// .*\n)+\n', '', s)
    s = s.replace('  },,\n', '  },\n')
    s = s.replace(',,', ',')
    p.write_text(s)
    print('merged into', path)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
