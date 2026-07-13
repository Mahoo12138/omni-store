import type { ReactNode } from 'react'
import type { FileEntry } from '../../api/sources'
import { EntryIcon } from '../ui/Icon'
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
  renderActions,
}: {
  entries: FileEntry[] | undefined
  loading?: boolean
  emptyTitle?: string
  emptyHint?: string
  onOpenDir: (name: string) => void
  // 文件名点击目标（公开侧 raw 链接）；不传则文件名不可点
  fileHref?: (entry: FileEntry) => string
  renderActions?: (entry: FileEntry) => ReactNode
}) {
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th className={css.th}>名称</th>
            <th className={css.th}>大小</th>
            <th className={css.th}>修改时间</th>
            {renderActions && (
              <th className={css.th} aria-label="操作" />
            )}
          </tr>
        </thead>
        <tbody>
          {entries?.map((entry) => (
            <tr key={entry.name} className={css.row}>
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
                      target="_blank"
                      rel="noreferrer"
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
              <td className={css.td}>{entry.type === 'file' ? formatBytes(entry.size) : '–'}</td>
              <td className={css.td}>{formatDate(entry.mtime)}</td>
              {renderActions && <td className={css.actionsCell}>{renderActions(entry)}</td>}
            </tr>
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
      {!loading && entries?.length === 0 && (
        <div className={css.empty}>
          <div className={css.emptyTitle}>{emptyTitle}</div>
          {emptyHint && <div>{emptyHint}</div>}
        </div>
      )}
    </div>
  )
}
