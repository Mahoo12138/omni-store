// 统一预览解析器（1.2.0，docs/design/preview-resolver.md）。
// 文件管理器与分享页共用：File Descriptor → resolvePreview → PreviewKind → Renderer。
// 仅依据扩展名与大小做静态解析；不信任任何上传时提供的 MIME。

export type PreviewKind =
  | 'image'
  | 'text'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'code'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'unsupported'

export interface PreviewDescriptor {
  name: string
  size?: number | null
}

// 各类型的内容读取上限：文本类限制读取量，二进制类限制进内存的 blob 大小。
// 超限回退 unsupported（下载），避免浏览器/后端为超大文件一次加载全部内容。
export const PREVIEW_CAPS = {
  TEXT_BYTES: 512 * 1024,
  MARKDOWN_BYTES: 1024 * 1024,
  JSON_BYTES: 1024 * 1024,
  SVG_BLOB_BYTES: 32 * 1024 * 1024,
  PDF_BLOB_BYTES: 64 * 1024 * 1024,
} as const

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico'])
// SVG 是活动内容，只能以图片语义渲染（blob 进 <img>，脚本不执行），且有体积上限。
const SVG_EXTS = new Set(['svg'])
const TEXT_EXTS = new Set(['txt', 'log', 'csv', 'tsv', 'ini', 'conf', 'cfg', 'env', 'toml'])
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx'])
const JSON_EXTS = new Set(['json', 'jsonc', 'map'])
const YAML_EXTS = new Set(['yml', 'yaml'])
// 代码语言子集（prismjs 已加载的语法）。html/svg/js 等活动内容不进入预览，直接回退下载。
const CODE_EXTS = new Set([
  'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'rb', 'php', 'sh', 'bash', 'zsh', 'sql', 'ts', 'tsx', 'jsx', 'lua', 'r',
])
const PDF_EXTS = new Set(['pdf'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv'])

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

// 1.2.0 首批预览类型；HTML/SVG/JS/Office 等一律 unsupported → 下载。
export function resolvePreview(desc: PreviewDescriptor): PreviewKind {
  const ext = extOf(desc.name)
  if (SVG_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.SVG_BLOB_BYTES ? 'unsupported' : 'image'
  }
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (PDF_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.PDF_BLOB_BYTES ? 'unsupported' : 'pdf'
  }
  if (MARKDOWN_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.MARKDOWN_BYTES ? 'unsupported' : 'markdown'
  }
  if (JSON_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.JSON_BYTES ? 'unsupported' : 'json'
  }
  if (YAML_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.TEXT_BYTES ? 'unsupported' : 'yaml'
  }
  if (CODE_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.TEXT_BYTES ? 'unsupported' : 'code'
  }
  if (TEXT_EXTS.has(ext)) {
    return desc.size != null && desc.size > PREVIEW_CAPS.TEXT_BYTES ? 'unsupported' : 'text'
  }
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'unsupported'
}

// 流式直连（<img>/<audio>/<video> 直接用 URL，依赖 HTTP Range/206）的类型。
// 图片中仅 SVG 因活动内容限制走 blob 通道，其余图片也走直连。
export function isStreamedKind(kind: PreviewKind): boolean {
  return kind === 'audio' || kind === 'video' || kind === 'image'
}
