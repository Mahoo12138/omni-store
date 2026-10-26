#!/usr/bin/env node
// 一次性 codemod:把全站散装的 @media 档位收敛到 styles/media.ts 的 6 档。
//
// 用法(在 web/ 下):
//   node scripts/align-breakpoints.mjs            # 只报告,不改文件
//   node scripts/align-breakpoints.mjs --values   # 执行第一遍:数值归位
//   node scripts/align-breakpoints.mjs --keys     # 执行第二遍:字符串键 → [media.*] 计算键
//
// 两遍分开设,是因为它们的可验证性不同:第一遍是纯数字替换(diff 极小、可肉眼逐条核),
// 第二遍改语法形态并插入 import。每遍各自一个 commit、各自跑一次 pnpm build。
//
// 归位原则:就近取档,平局向上取(让塌叠规则更早触发,而不是更晚),例外见下表注释。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src')

// 6 档,与 styles/media.ts 一致。
const TIERS = [480, 640, 820, 980, 1200, 1400]

// 显式映射:当前值 → 目标档。没列进来的值一律就近取档。
const MAP = {
  380: 480, 390: 480, 400: 480, 420: 480, 460: 480, 480: 480, 520: 480,
  560: 640, 600: 640, 620: 640, 640: 640,
  680: 820, 700: 820, 720: 820, 760: 820, 800: 820, 820: 820,
  860: 980, 900: 980, 960: 980, 980: 980,
  1040: 1200, 1080: 1200, 1180: 1200, 1200: 1200,
  1400: 1400, 1420: 1400,
}
// 两处刻意"更晚触发"的归位,改完要肉眼过对应页:
//   520 → 480:481–520px 区间不再塌叠(差 40px,是窄屏卡片网格,可接受)。
// 两处刻意"更早触发"很多档的归位:
//   560 → 640(差 80px):AdminOverview 有 8 条、Home/Dashboard/About/AnonymousUpload 各 1 条。

const TIER_NAME = { 480: 'xs', 640: 'sm', 820: 'md', 980: 'lg', 1200: 'xl', 1400: 'xxl' }

const files = execSync('git ls-files src', { encoding: 'utf8', cwd: resolve(SRC, '..') })
  .split('\n').filter(Boolean)
  .map((p) => resolve(resolve(SRC, '..'), p))
  .filter((p) => !p.endsWith('styles/media.ts') && /\.(ts|tsx|css)$/.test(p))

const mode = process.argv.includes('--values') ? 'values' : process.argv.includes('--keys') ? 'keys' : 'report'
let changed = 0
const notes = []

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let after = before
  const rel = file.replace(`${resolve(SRC, '..')}/`, '')

  if (mode === 'values') {
    after = after.replace(/@media screen and \(max-width: (\d+)px\)/g, (all, raw) => {
      const n = Number(raw)
      const target = MAP[n] ?? nearest(n)
      if (target === n) return all
      notes.push(`${rel}: ${n} → ${target}`)
      return `@media screen and (max-width: ${target}px)`
    })
  }

  if (mode === 'keys') {
    after = after.replace(/(['"])@media screen and \(max-width: (\d+)px\)\1:/g, (all, _q, raw) => {
      const n = Number(raw)
      if (!TIERS.includes(n)) { notes.push(`${rel}: 档位 ${n} 不在 6 档内,跳过`); return all }
      return `[media.${TIER_NAME[n]}]:`
    })
    after = after.replace(/(['"])@media \(prefers-reduced-motion: reduce\)\1:/g, '[media.reducedMotion]:')
    after = after.replace(/(['"])@media \(pointer: coarse\)\1:/g, '[media.coarsePointer]:')
    // 只有真的用到才加 import,且加在首个 import 之后
    if (/\[media\./.test(after) && !/^import \{ media \} from.*styles\/media/m.test(after)) {
      const depth = (file.match(/(?:^|\/)src\/(.*)\//)[1].match(/\//g) || []).length
      const importLine = `import { media } from '${'../'.repeat(depth + 1)}styles/media'`
      const lines = after.split('\n')
      const lastImport = lines.reduce((acc, l, i) => (/^import .* from '/.test(l) ? i : acc), -1)
      lines.splice(lastImport + 1, 0, importLine)
      after = lines.join('\n')
      notes.push(`${rel}: + import { media }`)
    }
    // .css 里没有 @import 机制可用,保留字面量并提示
    if (rel.endsWith('.css') && /@media/.test(after)) notes.push(`${rel}: CSS 文件,键位保持字面量(不接 AOT)`)
  }

  if (mode !== 'report' && after !== before) {
    writeFileSync(file, after)
    changed++
  }
}

function nearest(n) {
  return TIERS.reduce((best, t) => {
    const d = Math.abs(t - n)
    const bd = Math.abs(best - n)
    if (d < bd) return t
    // 平局向上取更大的档
    if (d === bd && t > best) return t
    return best
  }, TIERS[0])
}

if (mode === 'report') {
  const tally = {}
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/@media screen and \(max-width: (\d+)px\)/g)) {
      const n = Number(m[1])
      const t = MAP[n] ?? nearest(n)
      tally[`${n} → ${t}`] = (tally[`${n} → ${t}`] || 0) + 1
    }
  }
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1])
  let total = 0
  for (const [k, v] of rows) { console.log(String(v).padStart(4), k); total += v }
  console.log(`\n共 ${total} 处,@media 查询涉及 ${Object.keys(tally).length} 条改写规则`)
  console.log('未覆盖的查询(需人工):')
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/@media[^{]{0,60}/g)) {
      if (!/max-width: \d+px/.test(m[0]) && !/prefers-reduced-motion|pointer: coarse/.test(m[0])) {
        console.log(`  ${f.replace(`${resolve(SRC, '..')}/`, '')}: ${m[0].trim()}`)
      }
    }
  }
} else {
  console.log(`mode=${mode} 改写 ${changed} 个文件`)
  for (const n of notes) console.log(' ', n)
}
