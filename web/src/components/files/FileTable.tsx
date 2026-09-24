import { useState, type DragEvent, type ReactNode } from 'react'
import type { FileEntry } from '../../api/sources'
import { EntryIcon } from '../ui/Icon'
import { ContextMenu } from '../ui/ContextMenu'
import type { MenuOption } from '../ui/Menu'
import { formatBytes, formatDate } from '../../utils/format'
import * as css from './FileTable.css'

// 公开侧与私有侧共用的文件表格（docs/index.png）。
// 只负责渲染；导航、下载和写操作由调用方通过回调提供。
export function FileTable({
  entries,
  loading,
  emptyTitle = '目录为空',
  emptyHint,
  onOpenDir,
  fileHref,
  fileTarget,
  renderActions,
  showType = false,
  selectable = false,
  selectedNames,
  onToggleSelected,
  allSelected = false,
  onToggleAll,
  onDragEntryStart,
  onDropOnDirectory,
  contextMenuItems,
}: {
  entries: FileEntry[] | undefined
  loading?: boolean
  emptyTitle?: string
  emptyHint?: string
  onOpenDir: (name: string) => void
  // 文件名点击目标；不传则文件名不可点。
  fileHref?: (entry: FileEntry) => string
  // 预览链接可显式新开标签页；下载链接保持在当前页面触发浏览器下载。
  fileTarget?: '_blank'
  renderActions?: (entry: FileEntry) => ReactNode
  // 是否展示"类型"列（私有管理侧使用，按扩展名推断）
  showType?: boolean
  selectable?: boolean
  selectedNames?: ReadonlySet<string>
  onToggleSelected?: (name: string, selected: boolean) => void
  allSelected?: boolean
  onToggleAll?: (selected: boolean) => void
  onDragEntryStart?: (entry: FileEntry, event: DragEvent<HTMLTableRowElement>) => void
  onDropOnDirectory?: (entry: FileEntry, event: DragEvent<HTMLTableRowElement>) => void
  contextMenuItems?: (entry: FileEntry) => MenuOption[]
}) {
  const [dropTargetName, setDropTargetName] = useState<string | null>(null)
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            {selectable && (
              <th className={css.selectionTh}>
                <input
                  type="checkbox"
                  aria-label="选择当前页全部条目"
                  checked={allSelected}
                  onChange={(event) => onToggleAll?.(event.target.checked)}
                />
              </th>
            )}
            <th className={css.th}>名称</th>
            {showType && <th className={css.th}>类型</th>}
            <th className={css.th}>大小</th>
            <th className={css.th}>修改时间</th>
            {renderActions && (
              <th className={css.th} aria-label="操作" />
            )}
          </tr>
        </thead>
        <tbody>
          {entries?.map((entry) => (
            <ContextMenu
              key={entry.name}
              ariaLabel={`文件操作 ${entry.name}`}
              items={contextMenuItems?.(entry) ?? []}
              trigger={
                <tr
                  className={`${css.row} ${dropTargetName === entry.name ? css.dropTarget : ''}`}
                  draggable={Boolean(onDragEntryStart && entry.type !== 'unsupported')}
                  onDragStart={onDragEntryStart ? (event) => {
                    if (entry.type === 'unsupported') {
                      event.preventDefault()
                      return
                    }
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('application/x-omnistore-file-items', 'internal')
                    onDragEntryStart(entry, event)
                  } : undefined}
                  onDragOver={onDropOnDirectory && entry.type === 'dir' ? (event) => {
                    if (!event.dataTransfer.types.includes('application/x-omnistore-file-items')) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTargetName(entry.name)
                  } : undefined}
                  onDragLeave={onDropOnDirectory && entry.type === 'dir' ? (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetName(null)
                  } : undefined}
                  onDrop={onDropOnDirectory && entry.type === 'dir' ? (event) => {
                    if (!event.dataTransfer.types.includes('application/x-omnistore-file-items')) return
                    event.preventDefault()
                    setDropTargetName(null)
                    onDropOnDirectory(entry, event)
                  } : undefined}
                >
              {selectable && (
                <td className={css.selectionCell}>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${entry.name}`}
                    checked={selectedNames?.has(entry.name) ?? false}
                    disabled={entry.type === 'unsupported'}
                    onChange={(event) => onToggleSelected?.(entry.name, event.target.checked)}
                  />
                </td>
              )}
              <td className={css.nameCell}>
                <span className={css.nameInner}>
                  <EntryIcon name={entry.name} type={entry.type} />
                  {entry.type === 'dir' ? (
                    <button className={css.nameLink} onClick={() => onOpenDir(entry.name)}>
                      {entry.name}
                    </button>
                  ) : entry.type === 'file' && fileHref ? (
                    <a
                      className={css.nameLink}
                      href={fileHref(entry)}
                      target={fileTarget}
                      rel={fileTarget === '_blank' ? 'noreferrer' : undefined}
                    >
                      {entry.name}
                    </a>
                  ) : entry.type === 'file' ? (
                    <span className={css.nameStatic}>{entry.name}</span>
                  ) : (
                    <span className={css.nameMuted}>{entry.name}（符号链接，不支持）</span>
                  )}
                </span>
              </td>
              {showType && <td className={css.td}>{entry.type === 'dir' ? '文件夹' : guessType(entry.name)}</td>}
              <td className={css.td}>{entry.type === 'file' ? formatBytes(entry.size) : '–'}</td>
              <td className={css.td}>{formatDate(entry.mtime)}</td>
              {renderActions && <td className={css.actionsCell}>{renderActions(entry)}</td>}
                </tr>
              }
            />
          ))}
        </tbody>
      </table>
      {loading && (
        <div aria-busy="true" aria-label="加载中">
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
        </div>
      )}
      {showType && !loading && entries?.length === 0 && (
        <div className={css.empty}>
          <div className={css.emptyTitle}>{emptyTitle}</div>
          {emptyHint && <div>{emptyHint}</div>}
        </div>
      )}
    </div>
  )
}

// 按文件名推断文件类型描述（与 EntryIcon 中的 fileTypeMap / imageExts 保持一致）。
function guessType(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return '文件'
  const ext = name.slice(dot + 1).toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
    return `${ext.toUpperCase()} 图片`
  }
  const map: Record<string, string> = {
    pdf: 'PDF 文档',
    doc: 'Word 文档',
    docx: 'Word 文档',
    xls: 'Excel 表格',
    xlsx: 'Excel 表格',
    csv: 'Excel 表格',
    ppt: 'PPT 演示',
    pptx: 'PPT 演示',
    zip: '压缩包',
    rar: '压缩包',
    '7z': '压缩包',
    gz: '压缩包',
    mp4: 'MP4 视频',
    mkv: 'MKV 视频',
    mov: 'MOV 视频',
    mp3: '音频',
    flac: '音频',
    txt: '文本文档',
    md: 'Markdown',
  }
  return map[ext] || `${ext.toUpperCase()} 文件`
}
