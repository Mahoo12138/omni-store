import { useMemo } from 'react'
import Prism from 'prismjs'
// 按需注册 1.2.0 支持的语言（依赖顺序：cpp 依赖 c，tsx 依赖 jsx + typescript）
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-lua'
import 'prismjs/components/prism-r'
import { extOf } from './resolver'

const EXT_TO_LANG: Record<string, string> = {
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp', rb: 'ruby',
  php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx', lua: 'lua', r: 'r',
  json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
}

// 代码高亮渲染（参考 onedrive-vercel-index 的代码预览形态，用 prismjs 轻量实现）。
export function CodeBlock({ name, code }: { name: string; code: string }) {
  const html = useMemo(() => {
    const lang = EXT_TO_LANG[extOf(name)] ?? ''
    const grammar = lang ? Prism.languages[lang] : undefined
    if (!grammar) return escapeHtml(code)
    return Prism.highlight(code, grammar, lang)
  }, [name, code])
  return <pre className="omnistore-prism" dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
