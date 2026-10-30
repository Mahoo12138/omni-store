import { useState, type DragEvent } from 'react'
import type { FileEntry } from '../../api/sources'
import { ContextMenu } from '../ui/ContextMenu'
import type { MenuOption } from '../ui/Menu'
import { EntryActionsMenu } from './EntryActionsMenu'
import { StateView } from '../shell/StateView'
import { EntryIcon } from '../ui/Icon'
import {
  IconCloud,
  IconCopy,
  IconEdit,
  IconLink,
  IconScissors,
  IconStar,
  IconTrash,
} from '../ui/Icon'
import { useTheme } from '../../utils/useTheme'
import { entryTiles, pickThemeColor } from '../../styles/fileTypes'
import { useStyles } from './GridView.styles'

// 私有文件管理器的网格视图：选择、右键、拖拽与行内操作与 FileTable 对齐。
// 公开侧的画廊/网格是另一套（只读 + 预览），不复用这里的交互。
export function GridView({
  entries,
  loading,
  onOpenDir,
  onOpenFile,
  fileHref,
  onDelete,
  onRename,
  onCopy,
  onCut,
  onShare,
  onToggleFavorite,
  isFavorite,
  canWrite,
  filter,
  selectedNames,
  onToggleSelected,
  onDragEntryStart,
  onDropOnDirectory,
  contextMenuItems,
}: {
  entries: FileEntry[]
  loading?: boolean
  onOpenDir: (name: string) => void
  onOpenFile?: (entry: FileEntry) => void
  fileHref: (entry: FileEntry) => string
  onDelete: (name: string, type: string) => void
  onRename: (name: string) => void
  onCopy: (name: string) => void
  onCut: (name: string) => void
  onShare: (name: string, type: 'file' | 'dir') => void
  onToggleFavorite: (name: string) => void
  isFavorite: (name: string) => boolean
  canWrite: boolean
  filter: string
  selectedNames: ReadonlySet<string>
  onToggleSelected: (name: string, selected: boolean) => void
  onDragEntryStart?: (entry: FileEntry, event: DragEvent<HTMLDivElement>) => void
  onDropOnDirectory?: (entry: FileEntry, event: DragEvent<HTMLDivElement>) => void
  contextMenuItems?: (entry: FileEntry) => MenuOption[]
}) {
  const css = useStyles()
  const { resolved } = useTheme()
  const [dropTargetName, setDropTargetName] = useState<string | null>(null)
  if (loading) {
    return <StateView layout="plain" kind="loading" title="加载中…" />
  }
  if (entries.length === 0) {
    return (
      <StateView
        layout="plain"
        kind={filter ? 'filtered' : 'empty'}
        title={filter ? '没有匹配的条目' : '目录为空'}
      />
    )
  }
  return (
    <div className={css.gridWrap}>
      {entries.map((e) => (
        <ContextMenu
          key={e.name}
          ariaLabel={`文件操作 ${e.name}`}
          items={contextMenuItems?.(e) ?? []}
          trigger={
            <div
              draggable={Boolean(onDragEntryStart && e.type !== 'unsupported')}
              className={`${css.gridCard} ${dropTargetName === e.name ? css.dropTarget : ''}`}
              onDragStart={onDragEntryStart ? (event) => {
                if (e.type === 'unsupported') {
                  event.preventDefault()
                  return
                }
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('application/x-omnistore-file-items', 'internal')
                onDragEntryStart(e, event)
              } : undefined}
              onDragOver={onDropOnDirectory && e.type === 'dir' ? (event) => {
                if (!event.dataTransfer.types.includes('application/x-omnistore-file-items')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTargetName(e.name)
              } : undefined}
              onDragLeave={onDropOnDirectory && e.type === 'dir' ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetName(null)
              } : undefined}
              onDrop={onDropOnDirectory && e.type === 'dir' ? (event) => {
                if (!event.dataTransfer.types.includes('application/x-omnistore-file-items')) return
                event.preventDefault()
                setDropTargetName(null)
                onDropOnDirectory(e, event)
              } : undefined}
              onDoubleClick={() => e.type === 'dir' && onOpenDir(e.name)}
            >
              {e.type !== 'unsupported' && (
                <label className={css.gridSelect}>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${e.name}`}
                    checked={selectedNames.has(e.name)}
                    onChange={(event) => onToggleSelected(e.name, event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <span>选择</span>
                </label>
              )}
              <div className={css.gridIcon} onClick={() => e.type === 'dir' && onOpenDir(e.name)}>
                {e.type === 'dir' ? (
                  <IconCloud size={48} style={{ color: pickThemeColor(entryTiles.dir.fg, resolved) }} />
                ) : (
                  <EntryIcon name={e.name} type={e.type} />
                )}
              </div>
              {e.type === 'dir' ? (
                <button type="button" className={css.gridName} onClick={() => onOpenDir(e.name)}>{e.name}</button>
              ) : e.type === 'file' && onOpenFile ? (
                <button type="button" className={css.gridName} onClick={() => onOpenFile(e)}>{e.name}</button>
              ) : e.type === 'file' ? (
                <a className={css.gridName} href={fileHref(e)}>{e.name}</a>
              ) : (
                <span className={css.gridName}>{e.name}</span>
              )}
              {e.type !== 'unsupported' && (
                <span className={css.gridActions}>
                  <button
                    className={`${css.actionBtn} ${isFavorite(e.name) ? css.actionActive : ''}`}
                    aria-label={`${isFavorite(e.name) ? '取消收藏' : '收藏'} ${e.name}`}
                    aria-pressed={isFavorite(e.name)}
                    title={isFavorite(e.name) ? '取消收藏' : '收藏'}
                    onClick={() => onToggleFavorite(e.name)}
                  >
                    <IconStar size={12} />
                  </button>
                  <button className={css.actionBtn} title="复制" onClick={() => onCopy(e.name)}>
                    <IconCopy size={12} />
                  </button>
                  {canWrite && (
                    <>
                      <button
                        className={css.actionBtn}
                        title="创建分享"
                        onClick={() => onShare(e.name, e.type as 'file' | 'dir')}
                      >
                        <IconLink size={12} />
                      </button>
                      <EntryActionsMenu
                        entryName={e.name}
                        items={[
                          { id: 'rename', label: '重命名', icon: <IconEdit size={12} />, onSelect: () => onRename(e.name) },
                          { id: 'cut', label: '剪切', icon: <IconScissors size={12} />, onSelect: () => onCut(e.name) },
                          {
                            id: 'delete',
                            label: '删除',
                            icon: <IconTrash size={12} />,
                            danger: true,
                            onSelect: () => onDelete(e.name, e.type),
                          },
                        ]}
                      />
                    </>
                  )}
                </span>
              )}
            </div>
          }
        />
      ))}
    </div>
  )
}
