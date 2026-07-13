import type { CSSProperties, ReactNode } from 'react'

// 统一图标系统：24 视窗、1.8 描边、圆角端点的单风格内联 SVG。
// 图标只在这里定义，页面不散落 SVG / emoji。

interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

function Svg({ size = 20, className, style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Svg>
)

export const IconFolderFilled = (p: IconProps) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={p.className}
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
)

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4" />
  </Svg>
)

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M3 17l5-4 4 3 4-3 5 4" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </Svg>
)

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V5M7 9l5-4 5 4" />
    <path d="M4 19h16" />
  </Svg>
)

export const IconFolderPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </Svg>
)

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3Z" />
  </Svg>
)

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
  </Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
)

export const IconExternalLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-8 8" />
    <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
  </Svg>
)

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
)

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l5 5" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v11M7 12l5 4 5-4" />
    <path d="M4 19h16" />
  </Svg>
)

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
  </Svg>
)

export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const IconMove = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
  </Svg>
)

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
)

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10" />
  </Svg>
)

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </Svg>
)

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="14" r="4.5" />
    <path d="M11.5 10.5L20 2M16 6l3 3M13 9l2.5 2.5" />
  </Svg>
)

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 1 0-5.7-5.7L12 6.3" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 1 0 5.7 5.7L12 17.7" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconServer = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="7" rx="1.5" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Svg>
)

export const IconCloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 18a4 4 0 0 1-1-7.9A6 6 0 0 1 18 9.3 4.5 4.5 0 0 1 17 18H7Z" />
  </Svg>
)

export const IconHardDrive = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4Z" />
    <path d="M3 13l1.5-6a2 2 0 0 1 2-1.5h11a2 2 0 0 1 2 1.5L21 13" />
    <path d="M8 17h.01" />
  </Svg>
)

export const IconList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </Svg>
)

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
)

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </Svg>
)

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </Svg>
)

export const IconQuestion = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 4M12 17v.01" />
  </Svg>
)

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
)

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Svg>
)

export const IconUserPlus = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="4" />
    <path d="M2 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    <path d="M19 6v6M16 9h6" />
  </Svg>
)

// OmniStore 品牌标：立方体箱子里的六边形核心（对应设计稿的蓝色方块 logo）。
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path
        d="M14 6.8l6 3.4v7.6l-6 3.4-6-3.4v-7.6l6-3.4Z"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.3 10.5L14 13.7l5.7-3.2M14 13.7V21" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

// 文件类型 → 玻夫与颜色（对应设计稿的彩色文件图标）。
const fileTypeMap: Record<string, { label: string; color: string }> = {
  pdf: { label: 'P', color: 'oklch(0.55 0.19 27)' },
  doc: { label: 'W', color: 'oklch(0.55 0.2 262)' },
  docx: { label: 'W', color: 'oklch(0.55 0.2 262)' },
  xls: { label: 'X', color: 'oklch(0.52 0.14 150)' },
  xlsx: { label: 'X', color: 'oklch(0.52 0.14 150)' },
  csv: { label: 'X', color: 'oklch(0.52 0.14 150)' },
  ppt: { label: 'P', color: 'oklch(0.6 0.15 55)' },
  pptx: { label: 'P', color: 'oklch(0.6 0.15 55)' },
  zip: { label: 'Z', color: 'oklch(0.53 0.17 300)' },
  rar: { label: 'Z', color: 'oklch(0.53 0.17 300)' },
  '7z': { label: 'Z', color: 'oklch(0.53 0.17 300)' },
  gz: { label: 'Z', color: 'oklch(0.53 0.17 300)' },
  mp4: { label: '▶', color: 'oklch(0.52 0.11 210)' },
  mkv: { label: '▶', color: 'oklch(0.52 0.11 210)' },
  mov: { label: '▶', color: 'oklch(0.52 0.11 210)' },
  mp3: { label: '♪', color: 'oklch(0.52 0.11 210)' },
  flac: { label: '♪', color: 'oklch(0.52 0.11 210)' },
  txt: { label: 'T', color: 'oklch(0.5 0.02 262)' },
  md: { label: 'M', color: 'oklch(0.5 0.02 262)' },
}

const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'])

const tileStyle = (size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: Math.round(size * 0.28),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})

// 文件/目录图标（文件表格名称列使用）。
export function EntryIcon({ name, type, size = 26 }: { name: string; type: string; size?: number }) {
  if (type === 'dir') {
    return (
      <span style={{ ...tileStyle(size), color: 'oklch(0.72 0.13 75)' }}>
        <IconFolderFilled size={size * 0.85} />
      </span>
    )
  }
  if (type === 'unsupported') {
    return (
      <span
        style={{ ...tileStyle(size), background: 'oklch(0.94 0.005 262)', color: 'oklch(0.5 0.02 262)' }}
      >
        <IconLink size={size * 0.55} />
      </span>
    )
  }

  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (imageExts.has(ext)) {
    return (
      <span style={{ ...tileStyle(size), background: 'oklch(0.94 0.05 200)', color: 'oklch(0.52 0.11 210)' }}>
        <IconImage size={size * 0.6} />
      </span>
    )
  }
  const meta = fileTypeMap[ext]
  if (meta) {
    return (
      <span
        style={{
          ...tileStyle(size),
          background: meta.color,
          color: 'white',
          fontSize: size * 0.46,
          fontWeight: 700,
        }}
      >
        {meta.label}
      </span>
    )
  }
  return (
    <span style={{ ...tileStyle(size), background: 'oklch(0.94 0.005 262)', color: 'oklch(0.5 0.02 262)' }}>
      <IconFile size={size * 0.6} />
    </span>
  )
}

// 彩色图标砖（存储源卡片 / 快速操作使用）。
export function IconTile({
  bg,
  fg,
  size = 44,
  children,
}: {
  bg: string
  fg: string
  size?: number
  children: ReactNode
}) {
  return <span style={{ ...tileStyle(size), background: bg, color: fg }}>{children}</span>
}
