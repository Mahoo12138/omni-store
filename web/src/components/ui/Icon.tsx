import type { CSSProperties, FC, ReactNode } from 'react'
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowCounterclockwiseRegular,
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ArrowMoveRegular,
  ArrowUpRegular,
  ArrowUploadRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ClipboardRegular,
  CloudRegular,
  CopyRegular,
  CutRegular,
  DeleteRegular,
  DismissRegular,
  DocumentRegular,
  EditRegular,
  FolderAddRegular,
  FolderFilled,
  FolderRegular,
  GlobeRegular,
  GridRegular,
  HardDriveRegular,
  HomeRegular,
  ImageRegular,
  InfoRegular,
  KeyRegular,
  LinkRegular,
  ListRegular,
  MoreHorizontalRegular,
  OpenRegular,
  PersonAddRegular,
  PersonRegular,
  PulseRegular,
  QrCodeRegular,
  QuestionCircleRegular,
  SearchRegular,
  ServerRegular,
  SettingsRegular,
  ShieldRegular,
  SignOutRegular,
  StarRegular
} from '@fluentui/react-icons'

// 统一图标系统：通用图标改为 @fluentui/react-icons 的 shim（保持 IconXxx 命名、
// size/className/style props 兼容）；品牌标（LogoMark）与文件类型彩色砖
// （EntryIcon/IconTile）是业务资产，继续手绘 SVG。

interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

type FluentIcon = FC<{ className?: string; style?: CSSProperties; fontSize?: number }>

function shim(Icon: FluentIcon) {
  const Shim = ({ size = 20, className, style }: IconProps) => (
    <Icon fontSize={size} className={className} style={style} />
  )
  return Shim
}

export const IconActivity = shim(PulseRegular)
export const IconArrowLeft = shim(ArrowLeftRegular)
export const IconArrowUp = shim(ArrowUpRegular)
export const IconCheck = shim(CheckmarkRegular)
export const IconChevronDown = shim(ChevronDownRegular)
export const IconChevronLeft = shim(ChevronLeftRegular)
export const IconChevronRight = shim(ChevronRightRegular)
export const IconClipboard = shim(ClipboardRegular)
export const IconClose = shim(DismissRegular)
export const IconCloud = shim(CloudRegular)
export const IconCopy = shim(CopyRegular)
export const IconDownload = shim(ArrowDownloadRegular)
export const IconEdit = shim(EditRegular)
export const IconExternalLink = shim(OpenRegular)
export const IconFile = shim(DocumentRegular)
export const IconFolder = shim(FolderRegular)
export const IconFolderFilled = shim(FolderFilled)
export const IconFolderPlus = shim(FolderAddRegular)
export const IconGlobe = shim(GlobeRegular)
export const IconGrid = shim(GridRegular)
export const IconHardDrive = shim(HardDriveRegular)
export const IconHome = shim(HomeRegular)
export const IconImage = shim(ImageRegular)
export const IconInfo = shim(InfoRegular)
export const IconKey = shim(KeyRegular)
export const IconLink = shim(LinkRegular)
export const IconList = shim(ListRegular)
export const IconLogout = shim(SignOutRegular)
export const IconMore = shim(MoreHorizontalRegular)
export const IconMove = shim(ArrowMoveRegular)
export const IconPlus = shim(AddRegular)
export const IconQr = shim(QrCodeRegular)
export const IconQuestion = shim(QuestionCircleRegular)
export const IconRefresh = shim(ArrowClockwiseRegular)
export const IconRestore = shim(ArrowCounterclockwiseRegular)
export const IconScissors = shim(CutRegular)
export const IconSearch = shim(SearchRegular)
export const IconServer = shim(ServerRegular)
export const IconSettings = shim(SettingsRegular)
export const IconShield = shim(ShieldRegular)
export const IconStar = shim(StarRegular)
export const IconTrash = shim(DeleteRegular)
export const IconUpload = shim(ArrowUploadRegular)
export const IconUser = shim(PersonRegular)
export const IconUserPlus = shim(PersonAddRegular)

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
