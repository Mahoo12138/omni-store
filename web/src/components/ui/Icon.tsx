import type { CSSProperties, FC } from 'react'
import { tokens } from '@fluentui/react-components'
import { entryTiles, isImageName, pickThemeColor, resolveFileTypeTile } from '../../styles/fileTypes'
import { useTheme } from '../../utils/useTheme'
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowCounterclockwiseRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  ArrowUploadRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ClipboardRegular,
  CloudRegular,
  CopyRegular,
  CutRegular,
  DatabaseRegular,
  DarkThemeRegular,
  DeleteRegular,
  DismissRegular,
  DocumentRegular,
  EditRegular,
  ErrorCircleRegular,
  FolderAddRegular,
  FolderFilled,
  FolderRegular,
  GaugeRegular,
  GlobeRegular,
  HistoryRegular,
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
  PlugConnectedRegular,
  PulseRegular,
  QrCodeRegular,
  QuestionCircleRegular,
  SearchRegular,
  ServerRegular,
  SettingsRegular,
  ShieldCheckmarkRegular,
  ShieldRegular,
  SignOutRegular,
  StarRegular,
  TagRegular,
  WarningRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular
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
export const IconCheck = shim(CheckmarkRegular)
export const IconChevronDown = shim(ChevronDownRegular)
export const IconChevronLeft = shim(ChevronLeftRegular)
export const IconChevronRight = shim(ChevronRightRegular)
export const IconClipboard = shim(ClipboardRegular)
export const IconClose = shim(DismissRegular)
export const IconCloud = shim(CloudRegular)
export const IconCopy = shim(CopyRegular)
export const IconDatabase = shim(DatabaseRegular)
export const IconDownload = shim(ArrowDownloadRegular)
export const IconEdit = shim(EditRegular)
export const IconError = shim(ErrorCircleRegular)
export const IconExternalLink = shim(OpenRegular)
export const IconFile = shim(DocumentRegular)
export const IconFolder = shim(FolderRegular)
export const IconFolderFilled = shim(FolderFilled)
export const IconFolderPlus = shim(FolderAddRegular)
export const IconGauge = shim(GaugeRegular)
export const IconGlobe = shim(GlobeRegular)
export const IconGrid = shim(GridRegular)
export const IconHardDrive = shim(HardDriveRegular)
export const IconHistory = shim(HistoryRegular)
export const IconHome = shim(HomeRegular)
export const IconImage = shim(ImageRegular)
export const IconInfo = shim(InfoRegular)
export const IconKey = shim(KeyRegular)
export const IconLink = shim(LinkRegular)
export const IconList = shim(ListRegular)
export const IconLogout = shim(SignOutRegular)
export const IconMore = shim(MoreHorizontalRegular)
export const IconPlug = shim(PlugConnectedRegular)
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
export const IconShieldCheck = shim(ShieldCheckmarkRegular)
export const IconStar = shim(StarRegular)
export const IconSync = shim(ArrowSyncRegular)
export const IconTag = shim(TagRegular)
// 外观三档：跟随系统用 Fluent 的半明半暗图标，浅色/深色用晴与月。
export const IconThemeAuto = shim(DarkThemeRegular)
export const IconThemeDark = shim(WeatherMoonRegular)
export const IconThemeLight = shim(WeatherSunnyRegular)
export const IconTrash = shim(DeleteRegular)
export const IconUpload = shim(ArrowUploadRegular)
export const IconUser = shim(PersonRegular)
export const IconUserPlus = shim(PersonAddRegular)
export const IconWarning = shim(WarningRegular)

// OmniStore 品牌标：立方体箱子里的六边形核心（对应设计稿的蓝色方块 logo）。
// 底色与描边写死品牌对，不跟随容器的 currentColor —— 深色下容器文字是白色，
// 依赖 currentColor 会把方块染成白色、白色描边随之消失。
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill={tokens.colorBrandBackground} />
      <path
        d="M14 6.8l6 3.4v7.6l-6 3.4-6-3.4v-7.6l6-3.4Z"
        stroke={tokens.colorNeutralForegroundOnBrand}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.3 10.5L14 13.7l5.7-3.2M14 13.7V21"
        stroke={tokens.colorNeutralForegroundOnBrand}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const tileStyle = (size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: Math.round(size * 0.28),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})

// 文件/目录图标（文件表格名称列使用）。砖色与深浅两档见 styles/fileTypes.ts，
// 这里只负责按当前解析出的主题取色：inline style 走运行时，不受 AOT 字面量约束。
export function EntryIcon({ name, type, size = 26 }: { name: string; type: string; size?: number }) {
  const { resolved } = useTheme()

  if (type === 'dir') {
    return (
      <span style={{ ...tileStyle(size), color: pickThemeColor(entryTiles.dir.fg, resolved) }}>
        <IconFolderFilled size={size * 0.85} />
      </span>
    )
  }
  if (type === 'unsupported') {
    const link = entryTiles.link
    return (
      <span
        style={{
          ...tileStyle(size),
          background: pickThemeColor(link.bg, resolved),
          color: pickThemeColor(link.fg, resolved),
        }}
      >
        <IconLink size={size * 0.55} />
      </span>
    )
  }

  if (isImageName(name)) {
    const image = entryTiles.image
    return (
      <span
        style={{
          ...tileStyle(size),
          background: pickThemeColor(image.bg, resolved),
          color: pickThemeColor(image.fg, resolved),
        }}
      >
        <IconImage size={size * 0.6} />
      </span>
    )
  }

  const tile = resolveFileTypeTile(name, resolved)
  if (tile) {
    return (
      <span
        style={{
          ...tileStyle(size),
          background: tile.background,
          color: tile.color,
          fontSize: size * 0.46,
          fontWeight: 700,
        }}
      >
        {tile.label}
      </span>
    )
  }
  const file = entryTiles.file
  return (
    <span
      style={{
        ...tileStyle(size),
        background: pickThemeColor(file.bg, resolved),
        color: pickThemeColor(file.fg, resolved),
      }}
    >
      <IconFile size={size * 0.6} />
    </span>
  )
}
