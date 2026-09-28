import { useEffect, useRef } from 'react'
import { IconChevronLeft, IconChevronRight, IconClose, IconDownload } from '../components/ui/Icon'
import { formatBytes } from '../utils/format'
import { PreviewContent, type PreviewItem } from './PreviewContent'
import * as css from './Preview.css'

// 统一预览弹层：文件管理器与分享页共用同一套 PreviewContent 渲染器，
// 这里只负责壳：全屏遮罩、头部信息、上一个/下一个导航与键盘操作。
export function PreviewModal({ items, index, onIndexChange, onClose }: {
  items: PreviewItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const item = items[index]
  const closeRef = useRef<HTMLButtonElement>(null)
  const total = items.length

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        onIndexChange(index - 1)
      } else if (event.key === 'ArrowRight' && index < total - 1) {
        event.preventDefault()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, total, onClose, onIndexChange])

  if (!item) return null
  const downloadUrl = item.downloadUrl ?? (item.url.includes('?') ? `${item.url}&download=1` : `${item.url}?download=1`)

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={`预览 ${item.name}`}>
      <header className={css.header}>
        {total > 1 ? (
          <button
            type="button"
            className={css.navBtn}
            disabled={index <= 0}
            onClick={() => onIndexChange(index - 1)}
            aria-label="上一个文件"
          >
            <IconChevronLeft size={20} />
          </button>
        ) : null}
        <div className={css.headerInfo}>
          <span className={css.headerTitle}>{item.name}</span>
          <span className={css.headerMeta}>
            {total > 1 ? `${index + 1} / ${total} · ` : ''}
            {item.size != null ? `${formatBytes(item.size)} · ` : ''}Esc 关闭
          </span>
        </div>
        <a className={css.headerBtn} href={downloadUrl} aria-label={`下载 ${item.name}`}>
          <IconDownload size={18} />
        </a>
        <button type="button" ref={closeRef} className={css.headerBtn} onClick={onClose} aria-label="关闭预览">
          <IconClose size={20} />
        </button>
        {total > 1 ? (
          <button
            type="button"
            className={css.navBtn}
            disabled={index >= total - 1}
            onClick={() => onIndexChange(index + 1)}
            aria-label="下一个文件"
          >
            <IconChevronRight size={20} />
          </button>
        ) : null}
      </header>
      <div className={css.body}>
        <PreviewContent item={item} />
      </div>
    </div>
  )
}
